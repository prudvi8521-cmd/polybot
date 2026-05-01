import { RealTimeDataClient } from "./client";
import { ClobApiKeyCreds, UserMessage, MarketMessage } from "./model";
import { Wallet } from "ethers";
import { ClobClient, Side, OrderType } from "@polymarket/clob-client-v2";

export class TradingBot {
    private userClient: RealTimeDataClient; // For clob_user subscriptions
    private marketClient: RealTimeDataClient; // For clob_market subscriptions
    private clobClient: ClobClient; // For executing trades
    private positions: Map<string, Array<{ entryPrice: number; size: number }>> = new Map();
    private markPrices: Map<string, number> = new Map();
    private subscribedTokens: Set<string> = new Set();
    private clobApiCreds: ClobApiKeyCreds;
    private marketSubscriptionActive: boolean = false;
    private activeSellOrders: Set<string> = new Set();
    private activeBuyOrders: Set<string> = new Set();
    private buyOrderCountPerToken: Map<string, number> = new Map();  // Track buy count per
    private MAX_BUYS_PER_TOKEN: number;
    private BUY_SIZE: number;
    private sellOrderCountPerToken: Map<string, number> = new Map();  // Track sell count per token
    private MAX_SELLS_PER_TOKEN: number;
    private lastBuyTimestamp: Map<string, number> = new Map();
    private BUY_COOLDOWN_MS :number;

    constructor(clobClient: ClobClient, clobApiCreds: ClobApiKeyCreds, userClientArgs?: any, marketClientArgs?: any) {
        this.clobClient = clobClient;
        this.clobApiCreds = clobApiCreds;

        this.MAX_BUYS_PER_TOKEN = parseInt(process.env.MAX_BUYS_PER_TOKEN || "1", 10);
        this.MAX_SELLS_PER_TOKEN = parseInt(process.env.MAX_SELLS_PER_TOKEN || "1", 10);
        this.BUY_SIZE = parseFloat(process.env.BUY_SIZE || "1");
        this.BUY_COOLDOWN_MS = parseInt(process.env.BUY_COOLDOWN_MS || "40000", 10); 

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
        this.startPeriodicMarketRefresh();
    };


    /**
     * Handle user client messages
     */
    private onUserMessage = (_client: RealTimeDataClient, message: UserMessage) => {
        if ( message.side === "BUY" && message.status === "CONFIRMED") {
            try {
                    const data = message;
                    this.handleNewOrderOrMarketUpdate(data);
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
     * Start periodic refresh of market subscriptions at exact 5-minute intervals
     * (e.g., 3:00, 3:05, 3:10, etc.)
     */
    private startPeriodicMarketRefresh() {
        const scheduleNextRefresh = () => {
            const now = new Date();
            const currentMinutes = now.getMinutes()+1; // Add 1 minute to ensure we schedule for the next interval, not the current one at edges
            const currentSeconds = now.getSeconds();
            const currentMillis = now.getMilliseconds();
            
            // Calculate next 5-minute boundary
            const nextIntervalMinutes = Math.ceil(currentMinutes / 5) * 5;
            const minutesToAdd = nextIntervalMinutes === currentMinutes ? 5 : nextIntervalMinutes - currentMinutes;
            
            // Calculate milliseconds until next interval
            const millisecondsUntilNext = (minutesToAdd * 60 - currentSeconds) * 1000 - currentMillis;
            
            console.log(`Market refresh scheduled in ${(millisecondsUntilNext / 1000).toFixed(2)} seconds (next interval at ${String(nextIntervalMinutes % 60).padStart(2, '0')}:00)`);
            
            setTimeout(() => {
                this.refreshMarketSubscriptions();
                scheduleNextRefresh(); // Reschedule for next 5-minute interval
            }, millisecondsUntilNext);
        };
    
        scheduleNextRefresh();
    }


    /**
     * Fetch new token IDs from API and update market subscriptions
     */
    private async refreshMarketSubscriptions() {
        try {
            console.log(`[${new Date().toISOString()}] Refreshing market subscriptions at exact 5-minute interval...`);
            
            // Clear existing subscriptions and tokens
            console.log("Clearing previous subscriptions...");
            
            // Unsubscribe from all current tokens
            
            for (const token of this.subscribedTokens) {
                this.unsubscribeFromMarkets(token);
            }
            
            
            // Clear all tracking data
            this.subscribedTokens.clear();
            this.positions.clear();
            this.markPrices.clear();
            this.activeSellOrders.clear();
            this.activeBuyOrders.clear();
            this.buyOrderCountPerToken.clear(); 
            this.sellOrderCountPerToken.clear();
            
            console.log("All subscriptions cleared");


            // Calling polymarket API to get new token IDs for the next BTC 5-minute interval and subscribe to them
            const tokenIds = await this.fetchTokenIdsFromApi();
            
            for (const tokenId of tokenIds) {
                this.handleNewOrderOrMarketUpdate({ asset_id: tokenId });
            }

        } catch (error) {
            console.error("Error refreshing market subscriptions:", error);
        }
    }


    /**
     * Fetch token IDs from API
     */
    private async fetchTokenIdsFromApi(): Promise<string[]> {
        try {
            // Calculate current 5-minute interval in epoch seconds
            const now = Math.floor(Date.now() / 1000); // Current time in seconds
            const fiveMinutesInSeconds = 5 * 60;
            const currentInterval = Math.floor(now / fiveMinutesInSeconds) * fiveMinutesInSeconds;
            
            console.log(`Fetching tokens for interval: ${currentInterval}`);
            
            const response = await fetch(
                `https://gamma-api.polymarket.com/events/slug/btc-updown-5m-${currentInterval}`,
                {
                    method: "GET",
                    headers: { "Content-Type": "application/json" },
                }
            );
            
            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Extract token IDs from the API response
            const tokenIds: string[] = [];
            
            if (data.markets && Array.isArray(data.markets)) {
                data.markets.forEach((market: any) => {tokenIds.push(...JSON.parse(market.clobTokenIds));});
            };
            
            console.log(`Fetched ${tokenIds.length} token IDs from API`);
            return tokenIds;
            
        } catch (error) {
            console.error("Failed to fetch token IDs:", error);
            return [];
        }
    }




    /**
     * Handle user order updates and new market additions.
     */
    private handleNewOrderOrMarketUpdate(data: any) {
        // Extract token/market_id from the order data
        const token = data.asset_id;
        const price = data.price ? parseFloat(data.price) : -1; 
        const size = data.size ? parseFloat(data.size) : -1; 

        if (token && !this.subscribedTokens.has(token)) {
            console.log(`New token detected: ${token}, adding to market subscriptions...`);
            this.subscribedTokens.add(token);
            
            // Subscribe to clob_market with all accumulated tokens
            if (!this.marketSubscriptionActive) {    
                this.subscribeToMarkets(token);
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

    
    private subscribeToMarkets(asset_id: string) {

        console.log(`Subscribing to clob_market with token: ${asset_id}`);

        this.marketClient.subscribe(
                {
                    "type": "market",
                    "assets_ids": [asset_id],
                },
        );
        this.marketSubscriptionActive = true;
    }

    private addsubscriptionToMarkets(asset_id: string) {
        
        console.log(`Subscribing to clob_market with token: ${asset_id}`);
        
        this.marketClient.subscribe(
                {
                    "operation": "subscribe",
                    "assets_ids": [asset_id],
                },
        );
    }

    private unsubscribeFromMarkets(asset_id: string) {
        
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
     * Update mark price from book update data
     */
    private updateMarkPrice(data: any) {
        for (const key in [0,1]) {
            const midPrice = (parseFloat(data.price_changes[key].best_ask) + parseFloat(data.price_changes[key].best_bid)) / 2;
            const truncatedPrice = Math.floor(midPrice * 100) / 100;
            
            this.markPrices.set(data.price_changes[key].asset_id, truncatedPrice);
            //console.log(`Updated price for ${data.price_changes[key].asset_id}: ${truncatedPrice}`);
        }
    }


    /**
     * Evaluate current positions and execute trades if conditions are met
     */
    private evaluatePositions() {
        //console.log("Evaluating positions...");

        for (const [asset_id, positionsArray] of this.positions) {
            const markPrice = this.markPrices.get(asset_id);
            
            if (markPrice === undefined) {
                continue;
            }

            // Evaluate each position for this token
            for (const position of positionsArray) {
                if (this.shouldExecuteTrade(position.entryPrice, markPrice)) {
                    this.executeTrade(asset_id, markPrice, position.size, position.entryPrice);
                }
            }
        }
    }

 
    private shouldExecuteTrade(entryPrice: number, markPrice: number): boolean {
        // If position is -1, no position taken yet - decide on BUY
        if (entryPrice === -1) {
            return this.shouldBuy(markPrice);
        }
        
        // If position exists - decide on SELL based on threshold
        return this.shouldSell(entryPrice, markPrice);
    }

   
    private shouldBuy(markPrice: number): boolean {
        // Calculate time remaining until next 5-minute mark

        const now = new Date();
        const currentMinutes = now.getMinutes();
        const currentSeconds = now.getSeconds();
        
        const nextIntervalMinutes = Math.ceil(currentMinutes / 5) * 5;
        const minutesToNext = nextIntervalMinutes === currentMinutes ? 5 : nextIntervalMinutes - currentMinutes;
        const secondsToNext = minutesToNext * 60 - currentSeconds;
        
       // console.log(`Time left: ${secondsToNext}s (${(secondsToNext / 60).toFixed(2)}min), Price: ${markPrice}`);

       if(markPrice < 0.15&& secondsToNext > 250){
            this.refreshMarketSubscriptions();
            return false; // Skip buy if price is very low and we are far from next interval (to avoid buying liquidation traps right after refresh)
        }
        
        if (
            (markPrice < 0.35 && secondsToNext > 200) ||
            (markPrice < 0.25 && secondsToNext > 150 && secondsToNext <= 250) ||
            (markPrice < 0.15 && secondsToNext > 100 && secondsToNext <= 150) 
        ) {
            //console.log(`Buy condition met: price ${markPrice}, time ${(secondsToNext / 60).toFixed(2)}min`);
            return true;
        }
        
        return false;
    }

    
    private shouldSell(entryPrice: number, markPrice: number): boolean {
        // Example: Execute sell trade if price moves 15% from entry
        const threshold = 0.15;
        return (markPrice - entryPrice) / entryPrice > threshold;
    }

   
    private executeTrade(asset_id: string, markPrice: number, size: number, entryPrice: number) {        
        if (size !== -1) {
            this.executeSellTrade(asset_id, markPrice, size, entryPrice);
        } else {
            this.executeBuyTrade(asset_id, markPrice, this.BUY_SIZE); // Example size, adjust as needed
        }
    }


    private async executeBuyTrade(asset_id: string, markPrice: number, size: number) {
        //  protection
        if (this.activeBuyOrders.has(asset_id)) {
            //console.log(`Buy already in progress or completed for  ${asset_id}, skipping buy`);
            return;
        }

        // Check if we've exceeded max buys for this token
        const currentBuyCount = this.buyOrderCountPerToken.get(asset_id) || 0;
        if (currentBuyCount >= this.MAX_BUYS_PER_TOKEN) {
            //console.log(`Max buy orders (${this.MAX_BUYS_PER_TOKEN}) reached for token ${asset_id}, skipping buy`);
            return;
        }

        const now = Date.now();
        const lastBuy = this.lastBuyTimestamp.get(asset_id) || 0;

        if (now - lastBuy < this.BUY_COOLDOWN_MS) {
            //console.log(`Cooldown active for ${asset_id}, skipping buy`);
            return;
        }

        this.activeBuyOrders.add(asset_id);
        this.buyOrderCountPerToken.set(asset_id, currentBuyCount + 1);  // Increment buy count for this token
        this.lastBuyTimestamp.set(asset_id, now);
        console.log(`Buy order initiated for ${asset_id}. Buy count: ${this.buyOrderCountPerToken.get(asset_id)}/${this.MAX_BUYS_PER_TOKEN}`);

        try {
            console.log(`Executing BUY trade for ${asset_id} at price ${markPrice} and size ${size}`);

            const response = await this.clobClient.createAndPostMarketOrder(
                {
                    tokenID: asset_id,
                    side: Side.BUY,
                    amount: size,
                    price: 0.50, // worst-price limit (slippage protection)
                },
                { tickSize: "0.01", negRisk: false },
                OrderType.FOK,	//Fill-Or-Kill — must fill immediately and entirely, or cancel
            );

            console.log("Buy Order ID:", response.orderID);
            console.log("Status:", response.status);

        } catch (err) {
            console.error("Buy trade failed:", err);
            // Retry logic if failed
            this.buyOrderCountPerToken.set(asset_id, currentBuyCount - 1);  // Increment buy count for this token
            this.lastBuyTimestamp.set(asset_id, lastBuy);
        }
        this.activeBuyOrders.delete(asset_id);
    }

    private async executeSellTrade(asset_id: string, markPrice: number, size: number, entryPrice: number) {
        //  protection
        if (this.activeSellOrders.has(asset_id)) {
            console.log(`Sell already in progress or completed for ${asset_id}, skipping`);
            return;
        }

        // Check if we've exceeded max sells for this token
        const currentSellCount = this.sellOrderCountPerToken.get(asset_id) || 0;
        if (currentSellCount >= this.MAX_SELLS_PER_TOKEN) {
            console.log(`Max sell orders (${this.MAX_SELLS_PER_TOKEN}) reached for token ${asset_id}, skipping sell`);
            return;
        }

        this.activeSellOrders.add(asset_id);
        this.sellOrderCountPerToken.set(asset_id, currentSellCount + 1);  // Increment sell count for this token
        console.log(`Sell order initiated for ${asset_id}. Sell count: ${this.sellOrderCountPerToken.get(asset_id)}/${this.MAX_SELLS_PER_TOKEN}`);
        this.removePosition(asset_id, size, entryPrice);

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
                OrderType.FAK, //Fill-And-Kill — fill as much as possible immediately, and cancel any unfilled portion
            );

            console.log("Order ID:", response.orderID);
            console.log("Status:", response.status);
            

        } catch (err) {
            console.error("Trade failed:", err);
            this.addPosition(asset_id, markPrice, size);
            this.sellOrderCountPerToken.set(asset_id, currentSellCount - 1);  // Decrement sell count for this token

        }
        this.activeSellOrders.delete(asset_id);
}

    /**
     * Add a position to track
     */
    public addPosition(token_id: string, entryPrice: number, size: number) {
        const positionsPerTokenArray = this.positions.get(token_id) || [];
        positionsPerTokenArray.push({ entryPrice, size });
        this.positions.set(token_id, positionsPerTokenArray);
        console.log(`Added position: ${token_id} @ ${entryPrice}, size: ${size}. Total positions: ${positionsPerTokenArray.length}`);
    }

    /**
     * Remove a specific position for a token by size and entry price
     */
    private removePosition(asset_id: string, size: number, entryPrice: number) {
        const positionsArray = this.positions.get(asset_id);
        if (positionsArray) {
            const index = positionsArray.findIndex(p => p.size === size && p.entryPrice === entryPrice);
            if (index !== -1) {
                positionsArray.splice(index, 1);
                console.log(`Removed position for ${asset_id} (size: ${size}, entryPrice: ${entryPrice}). Remaining positions: ${positionsArray.length}`);
            }
            // Delete token from map if no positions left
            if (positionsArray.length === 0) {
                this.positions.delete(asset_id);
            }
        }
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
