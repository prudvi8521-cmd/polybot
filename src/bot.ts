import { RealTimeDataClient } from "./client";
import { ClobApiKeyCreds, UserMessage, MarketMessage } from "./model";
import { Wallet } from "ethers";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client-v2";

export class TradingBot {
    private userClient: RealTimeDataClient; // For clob_user subscriptions
    private marketClient: RealTimeDataClient; // For clob_market subscriptions
    private clobClient: ClobClient; // For executing trades
    private positions: Map<string, { entryPrice: number; size: number }> = new Map();
    private markPrices: Map<string, number> = new Map();
    private subscribedTokens: Set<string> = new Set();
    private marketTokens: string[] = [];
    private clobApiCreds: ClobApiKeyCreds;
    private marketSubscriptionActive: boolean = false;
    private activeSellOrders: Set<string> = new Set();

    constructor(clobClient: ClobClient, clobApiCreds: ClobApiKeyCreds, userClientArgs?: any, marketClientArgs?: any) {
        this.clobClient = clobClient;
        this.clobApiCreds = clobApiCreds;

        // Client for user orders
        this.userClient = new RealTimeDataClient({
            onConnect: this.onUserConnect.bind(this),
            onMessage: this.onUserMessage.bind(this),
            ...userClientArgs,
        });

        // Client for market data
        this.marketClient = new RealTimeDataClient({
            onConnect: this.onMarketConnect.bind(this),
            onMessage: this.onMarketMessage.bind(this),
            ...marketClientArgs,
        });
    }

    /**
     * Initialize bot with credentials derived from private key in .env
     */
    public static async create(userClientArgs?: any, marketClientArgs?: any): Promise<TradingBot> {
        const privateKey = process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error("PRIVATE_KEY not found in .env");
        }

        const HOST = "https://clob.polymarket.com";
        const CHAIN_ID = 137; // Polygon mainnet
        const signer = new Wallet(privateKey);

        const tempClient = new ClobClient({ host: HOST, chain: CHAIN_ID, signer });
        const apiCreds = await tempClient.deriveApiKey();  // Derive API credentials

        const clobClient = new ClobClient({
            host: HOST,
            chain: CHAIN_ID,
            signer,
            creds: apiCreds,
            signatureType: 1, // POLY_PROXY
            funderAddress: process.env.FUNDER_ADDRESS,
        });

        return new TradingBot(clobClient, apiCreds, userClientArgs, marketClientArgs);
    }

    

    /**
     * Initialize the bot and connect to both WebSocket clients
     */
    public start() {
        console.log("Connecting user client...");
        this.userClient.connect();
        
        console.log("Connecting market client...");
        this.marketClient.connect();
    }

    /**
     * Callback when user client connects
     */
    private onUserConnect = (_client: RealTimeDataClient) => {
        console.log("User client connected to Polymarket");
        this.subscribeToUserData();
    };

    /**
     * Callback when market client connects
     */
    private onMarketConnect = (_client: RealTimeDataClient) => {
        console.log("Market client connected to Polymarket");
    };

    /**
     * Subscribe to user order stream
     */
    private subscribeToUserData() {
        this.userClient.subscribe(
            // subscribe to user orders
            {
                "auth": {
                    "apiKey": this.clobApiCreds.key,
                    "secret": this.clobApiCreds.secret,
                    "passphrase": this.clobApiCreds.passphrase,
                },
                "type": "user",
        });
    }

    /**
     * Handle user client messages
     */
    private onUserMessage = (_client: RealTimeDataClient, message: UserMessage) => {
        if ( message.side === "BUY" && message.status === "CONFIRMED") {
            try {
                    const data = message;
                    this.handleUserOrder(data);
            } catch (error) {
                console.error("Error parsing user message payload:", error);
            }
        }
    };

    /**
     * Handle market client messages
     */
    private onMarketMessage = (_client: RealTimeDataClient, message: MarketMessage) => {
        if (message.event_type === "price_change" ) {
            try {
                    const data = message;
                // Handle price updates
                    this.updateMarkPrice(data);
                    this.evaluatePositions();
            }catch (error) {
                console.error("Error parsing market message payload:", error);
            }
        }
    };



    /**
     * Update mark price from book update data
     */
    private updateMarkPrice(data: any) {
            const key = this.subscribedTokens.has(data.price_changes[0].asset_id) ? 0 : this.subscribedTokens.has(data.price_changes[1].asset_id) ? 1 : -1;
            if (key !== -1) {
                this.markPrices.set(data.price_changes[key].asset_id, (parseFloat(data.price_changes[key].best_ask) + parseFloat(data.price_changes[key].best_bid)) / 2);
                console.log(`Updated price for ${data.price_changes[key].asset_id}: ${(parseFloat(data.price_changes[key].best_ask) + parseFloat(data.price_changes[key].best_bid)) / 2}`);
            }
    }

    /**
     * Handle user order updates and subscribe to corresponding markets
     */
    private handleUserOrder(data: any) {
        // Extract token/market_id from the order data
        const token = data.asset_id;
        const price = data.price;
        const size = data.size;
        
        if (token && !this.subscribedTokens.has(token) && !this.activeSellOrders.has(token)) {
            console.log(`New token detected: ${token}, adding to market subscriptions...`);
            this.subscribedTokens.add(token);
            this.marketTokens.push(token);
            
            // Resubscribe to clob_market with all accumulated tokens
            if (!this.marketSubscriptionActive) {    
                this.subscribeToMarkets();
            } else {
                this.addsubscriptionToMarkets(token);
            }
        }
        
        // Add position from order data if price is available
        if (token && price) {
            this.addPosition(token, price, size);
        }
    }

    /**
     * Subscribe to clob_market with all accumulated token filters
     */
    private subscribeToMarkets() {
        if (this.marketTokens.length === 0) return;
        
        console.log(`Subscribing to clob_market with tokens: ${this.marketTokens.join(", ")}`);

        // Subscribe with updated token filters
        this.marketClient.subscribe(
                {
                    "type": "market",
                    "assets_ids": this.marketTokens,
                },
        );
        this.marketSubscriptionActive = true;
    }

    private addsubscriptionToMarkets(asset_id: string) {
        
        console.log(`Subscribing to clob_market with token: ${asset_id}`);
        
        // Subscribe with updated token filters
        this.marketClient.subscribe(
                {
                    "operation": "subscribe",
                    "assets_ids": [asset_id],
                },
        );
        this.marketSubscriptionActive = true;
    }

    private unsubscribeFromMarkets(asset_id: string) {
        // if (this.marketTokens.length === 0) return;
        
        console.log(`Unsubscribing from clob_market with token: ${asset_id}`);
        
        // Subscribe with updated token filters
        this.marketClient.subscribe(
                {
                    "assets_ids": [asset_id],
                    "operation": "unsubscribe",
                },
        );
    }



    /**
     * Evaluate current positions and execute trades if conditions are met
     */
    private evaluatePositions() {
        console.log("Evaluating positions...");

        for (const [asset_id, position] of this.positions) {
            const markPrice = this.markPrices.get(asset_id);
            
            //  Skip if already selling
            if (this.activeSellOrders.has(asset_id)) {
                continue;
            }
            if (markPrice === undefined) {
                continue;
            }

            // Add your trading logic here
            if (this.shouldExecuteTrade( position.entryPrice, markPrice)) {
                this.executeTrade(asset_id, markPrice, position.size);
            }
        }
    }

    /**
     * Determine if a trade should be executed
     */
    private shouldExecuteTrade( position: number, markPrice: number): boolean {
        // Example: Execute trade if price moves 5% from entry
            const threshold = 0.15;
            return (markPrice - position) / position > threshold;
    }

    /**
     * Execute a trade for the given market
     */
    private async executeTrade(asset_id: string, markPrice: number, size: number) {
        //  Double protection
        if (this.activeSellOrders.has(asset_id) || !this.subscribedTokens.has(asset_id)) {
            console.log(`Sell already in progress or completed for ${asset_id}, skipping`);
            if (this.subscribedTokens.has(asset_id)) {
                this.unsubscribeFromMarkets(asset_id);
            }
            return;
        }

        this.activeSellOrders.add(asset_id);
        this.marketTokens = this.marketTokens.filter(token => token !== asset_id);
        this.subscribedTokens.delete(asset_id);
        this.unsubscribeFromMarkets(asset_id);
        this.positions.delete(asset_id);

        try {
            const truncated_size = Math.floor(size * 100) / 100;

            console.log(`Executing trade for ${asset_id} at price ${markPrice} and size ${truncated_size}`);

            const response = await this.clobClient.createAndPostMarketOrder(
                {
                    tokenID: asset_id,
                    side: Side.SELL,
                    amount: truncated_size,
                    price: 0.05, //worst-price limit (slippage protection)

                },
                { tickSize: "0.01", negRisk: false },
                OrderType.FAK,
            );

            console.log("Order ID:", response.orderID);
            console.log("Status:", response.status);
            

        } catch (err) {
            console.error("Trade failed:", err);
            // Allow retry if failed
            this.subscribedTokens.add(asset_id);
            this.marketTokens.push(asset_id);
            this.subscribeToMarkets();
            this.addPosition(asset_id, markPrice, size);

        }
        this.activeSellOrders.delete(asset_id);
}

    /**
     * Add a position to track
     */
    public addPosition(marketId: string, entryPrice: number, size: number) {
        this.positions.set(marketId, { entryPrice, size });
        console.log(`Added position: ${marketId} @ ${entryPrice} , size: ${size}`);
    }

    /**
     * Stop the bot
     */
    public stop() {
        // Unsubscribe from all subscriptions
        if (this.marketSubscriptionActive) {
            this.marketClient.unsubscribe({
                subscriptions: [
                    {
                        topic: "clob_market",
                        type: "*",
                    },
                ],
            });
        }
        
        this.userClient.unsubscribe({
            subscriptions: [
                {
                    topic: "clob_user",
                    type: "*",
                },
            ],
        });
        
        this.userClient.disconnect();
        this.marketClient.disconnect();
        console.log("Bot stopped");
    }
}
