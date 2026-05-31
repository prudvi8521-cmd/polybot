import { RealTimeDataClient } from "./client";
import { ClobApiKeyCreds, UserMessage, MarketMessage } from "./model";
import { Wallet } from "ethers";
import { ClobClient, Side, OrderType, AssetType } from "@polymarket/clob-client-v2";


const MODES = {
    UNIDIRECTIONAL: "UNIDIRECTIONAL",
    COUNTERDIRECTIONAL: "COUNTERDIRECTIONAL",
    BIDIRECTIONAL: "BIDIRECTIONAL",
    LIMIT: "LIMIT", 
} as const;

type TradingMode = typeof MODES[keyof typeof MODES];

const modeMap: Record<number, TradingMode> = {
    1: MODES.UNIDIRECTIONAL,
    [-1]: MODES.COUNTERDIRECTIONAL,
    2: MODES.BIDIRECTIONAL,
    0: MODES.LIMIT, 
};


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
    private sellOrderCountPerToken: Map<string, number> = new Map();  // Track sell count per token
    private MAX_BUYS_PER_TOKEN: number;
    private BUY_SIZE: number;
    private MAX_SELLS_PER_TOKEN: number;
    private BUY_COOLDOWN_MS :number;
    private SELL_COOLDOWN_MS :number;
    private lastBuyTimestamp: Map<string, number> = new Map();
    private lastSellTimestamp: Map<string, number> = new Map();
    private intervalRealizedPnL: number = 0;
    private totalRealizedPnL: number = 0;
    private totalBuys: number = 0;
    private totalSells: number = 0;
    private isfirstConnect: boolean = true;
    private mode: TradingMode; 
    private period: number;
    private limitSellActive: Set<string> = new Set(); 
    private isLimitCancelled: boolean = false;

    constructor(clobClient: ClobClient, clobApiCreds: ClobApiKeyCreds, userClientArgs?: any, marketClientArgs?: any) {
        this.clobClient = clobClient;
        this.clobApiCreds = clobApiCreds;

        this.MAX_BUYS_PER_TOKEN = parseInt(process.env.MAX_BUYS_PER_TOKEN || "1", 10);
        this.MAX_SELLS_PER_TOKEN = parseInt(process.env.MAX_SELLS_PER_TOKEN || "1", 10);
        this.BUY_SIZE = parseFloat(process.env.BUY_SIZE || "1");
        this.BUY_COOLDOWN_MS = parseInt(process.env.BUY_COOLDOWN_MS || "30000", 10); 
        this.SELL_COOLDOWN_MS = parseInt(process.env.SELL_COOLDOWN_MS || "1000", 10);
        this.period = parseInt(process.env.PERIOD || "5", 10); // Default to 5-minute intervals, can be adjusted as needed
        const modeNumber = parseInt(process.env.MODE || "1", 10);
        this.mode = modeMap[modeNumber] || MODES.UNIDIRECTIONAL;

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
        if (this.isfirstConnect) {
            this.startPeriodicMarketRefresh();
            this.isfirstConnect = false;
        }
        else if (this.subscribedTokens.size > 0) {
            // Re-subscribe to markets on reconnect 
            for (const token of this.subscribedTokens) {
                this.subscribeToMarkets(token);
            }
        }
    };


    /**
     * Handle user client messages
     */
    private onUserMessage = (_client: RealTimeDataClient, message: UserMessage) => {
        if (message.status === "CONFIRMED" || message.status === "FAILED") {   
            console.log(message.status);
        }

        if (message.side === "BUY" && message.status === "MATCHED") {//using MATCHED instead of CONFIRMED to reduce latency though can be inaccurate if fails.
            const data = message;
            this.handleNewOrderOrMarketUpdate(data);
        }
        else if (message.side === "SELL" && message.status === "FAILED") {
            this.addPosition(message.asset_id, parseFloat(message.price), parseFloat(message.size));
            this.totalSells -= 1;
            this.sellOrderCountPerToken.set(message.asset_id, this.sellOrderCountPerToken.get(message.asset_id)! - 1);
        }

    };

    /**
     * Handle market client messages
     */
    private onMarketMessage = (_client: RealTimeDataClient, message: MarketMessage) => {
        
        if (message.event_type === "price_change" ) {
            const data = message;
            // Handle price updates
            this.updateMarkPrice(data);
            this.evaluatePositions(data);
        }
    };

    
    /**
     * Start periodic refresh of market subscriptions at exact 5-minute intervals
     * (e.g., 3:00, 3:05, 3:10, etc.)
     */
    private startPeriodicMarketRefresh() {
        const scheduleNextRefresh = () => {
            const now = Date.now();
            const FIVE_MIN = 5 * 60 * 1000;
            
            // Calculate next 5-minute boundary
            const delay = Math.ceil(now / FIVE_MIN) * FIVE_MIN - now;
                        
            console.log(`Market refresh scheduled in ${(delay / 1000).toFixed(2)} seconds (next interval at ${String(new Date(now + delay).getMinutes()).padStart(2, '0')}:00)`);
            
            setTimeout(async () => {
                await this.refreshMarketSubscriptions();
                scheduleNextRefresh();
            }, delay+300); // Add buffer to ensure we're in the next interval
        };
    
        scheduleNextRefresh();
    }


    /**
     * Fetch new token IDs from API and update market subscriptions
     */
    private async refreshMarketSubscriptions() {
        try {

            console.log(`=== 5-MIN INTERVAL SUMMARY ===`);
            for (const [token, positionsArray] of this.positions) {
                const remaining = positionsArray.filter(p => p.size !== -1).length;

                if (remaining > 0) {
                    console.log(`[FAILED TO CLOSE] ${token}: ${remaining}`);   
                }

                for (const pos of positionsArray) {
                    if(pos.size === -1){
                        continue; // Skip positions that were never bought
                    }
                    const pnl = (0 - pos.entryPrice) * pos.size ;
                    this.intervalRealizedPnL += pnl;
                }
            }

            this.totalRealizedPnL += this.intervalRealizedPnL;

            console.log(`Total Interval PnL: ${(this.intervalRealizedPnL.toFixed(2))}`);
            console.log(`Total Realized PnL: ${this.totalRealizedPnL.toFixed(2)}`);
            console.log(`Total Buys: ${this.totalBuys}`);
            console.log(`Total Sells: ${this.totalSells}`);
            console.log(`=== [${new Date().toISOString()}] ===`)


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
            this.intervalRealizedPnL = 0;
            this.lastBuyTimestamp.clear();
            this.lastSellTimestamp.clear();
            this.limitSellActive.clear();
            this.isLimitCancelled = false;
            
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
                `https://gamma-api.polymarket.com/events/slug/btc-updown-${this.period}m-${currentInterval}`,
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
        if (this.mode === MODES.LIMIT && data.trader_side == "MAKER" && data.maker_orders && Array.isArray(data.maker_orders)) {
            console.log(data)
            data = data.maker_orders.find((o: { maker_address: string; }) => o.maker_address?.toLowerCase() === process.env.FUNDER_ADDRESS?.toLowerCase());
            console.log(data)
            data.size=data.matched_amount;
            if (data.side=="SELL"){
                this.limitSellActive.delete(data.asset_id);
            }
        }
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

        this.marketClient.subscribe(
            {
                "type": "market",
                "assets_ids": [asset_id],
            },
        );
        this.marketSubscriptionActive = true;
    }

    private addsubscriptionToMarkets(asset_id: string) {
                
        this.marketClient.subscribe(
            {
                "operation": "subscribe",
                "assets_ids": [asset_id],
            },
        );
    }

    private unsubscribeFromMarkets(asset_id: string) {
        
        console.log(`Unsubscribing from clob_market with token: ${asset_id}`);
        
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
            //  console.log(`Updated price for ${data.price_changes[key].asset_id}: ${truncatedPrice}`);
        }
    }


    /**
     * Evaluate current positions and execute trades if conditions are met
     */
    private async evaluatePositions(data: any) {
        // console.log("Evaluating positions against current market data...");

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

        if (this.mode === MODES.LIMIT && this.limitSellActive.size > 0) {// stop-loss for limit orders 

            //  console.log("Evaluating limit sell orders...");
             data= data.price_changes.find((p: { asset_id: string; }) => this.limitSellActive.has(p.asset_id));
             if (!data) {
                return;
             }
             const asset_id = data.asset_id;
             const markPrice =  this.markPrices.get(asset_id) ?? -1;

             if (markPrice < 0.12 && this.secondsToNext5Min() < 150){ // Emergency sell if price drops too much before next interval to prevent large losses

                    console.log(`Price dropped significantly for ${asset_id} ( mark: ${markPrice}), executing sell at market price to minimize losses. Sell count: ${this.sellOrderCountPerToken.get(asset_id)}/${this.MAX_SELLS_PER_TOKEN}`);
                                        
                    const now = Date.now();
                    const lastSell = this.lastSellTimestamp.get(asset_id) || 0;

                    if (now - lastSell < this.SELL_COOLDOWN_MS) {
                        //console.log(`Cooldown active for ${asset_id}, skipping sell`);
                        return;
                    }

                    this.lastSellTimestamp.set(asset_id, now);
                    
                    this.limitSellActive.delete(asset_id); 

                    const balanceData = await this.clobClient.getBalanceAllowance({
                        token_id: asset_id,
                        asset_type: AssetType.CONDITIONAL
                    });
                    const totalShares = Number(balanceData.balance)/1000000;

                    this.clobClient.cancelMarketOrders({asset_id:asset_id}); // Cancel any existing sell orders for this token to avoid conflicts

                    try {   
                        this.clobClient.createAndPostMarketOrder(
                            {
                                tokenID: asset_id,
                                side: Side.SELL,
                                amount: totalShares,
                                price: 0.05, //worst-price limit (slippage protection)
                            }
                        ,{ tickSize: "0.01", negRisk: false }, OrderType.FAK
                        );
                    }

                    catch(err){
                        console.error(`Emergency sell failed :`, err);
                        this.limitSellActive.add(asset_id); // Re-add to attempt again 
                    }
                }
        }
    }

 
    private shouldExecuteTrade(entryPrice: number, markPrice: number): boolean{
        // If position is -1, no position taken yet - decide on BUY
        if (entryPrice === -1) {
            return this.shouldBuy(markPrice);
        }
        
        // If position exists - decide on SELL based on threshold
        return this.shouldSell(entryPrice, markPrice);
    }

   
    private shouldBuy(markPrice: number): boolean{
        // Calculate time remaining until next 5-minute mark

        
       // console.log(`Time left: ${secondsToNext}s (${(secondsToNext / 60).toFixed(2)}min), Price: ${markPrice}`);
       
        const secondsToNext = this.secondsToNext5Min();

        if ((this.mode == MODES.UNIDIRECTIONAL && (markPrice>=0.60 && secondsToNext < 295))||
            ((this.mode == MODES.COUNTERDIRECTIONAL && (markPrice <= 0.43))||
            ((this.mode == MODES.BIDIRECTIONAL) && (markPrice <= 0.41 && markPrice>=0.26 && secondsToNext < 295 ))||
            (this.mode == MODES.LIMIT)))
        {
            // console.log(`Buy condition met: price ${markPrice}, time ${(secondsToNext / 60).toFixed(2)}min`);
            return true;
        }
        
        return false;
    }

    
    private shouldSell(entryPrice: number, markPrice: number): boolean {
        // Example: Execute sell trade if price moves 15% from entry
        entryPrice = parseFloat(entryPrice.toFixed(2));

        if(((this.mode == MODES.UNIDIRECTIONAL) && (markPrice <= 0.45))||
           ((this.mode == MODES.COUNTERDIRECTIONAL) && (markPrice <= 0.15))||
           ((this.mode == MODES.BIDIRECTIONAL) && (markPrice <= 0.15 || (markPrice-entryPrice)/entryPrice >= 0.20))||
           (this.mode == MODES.LIMIT)){
            return true;  
        }
        return false;
        // const threshold = -0.40;
        // return (markPrice - entryPrice) / entryPrice < threshold;
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

        if(this.mode == MODES.LIMIT && this.secondsToNext5Min() < 120 && this.isLimitCancelled==false &&(this.sellOrderCountPerToken.get(asset_id) || 0) == 0){ 
            console.log(`canceling existing orders`);
            try{
                this.clobClient.cancelAll();        
                this.isLimitCancelled=true;
            }
            catch{
                console.error(`Failed to cancel orders for ${asset_id}:`);
            };
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

        // if(this.lastBuyTimestamp.size > 0){// temp check to limit buy to 1
        //     return;
        // }

        this.activeBuyOrders.add(asset_id);
        this.buyOrderCountPerToken.set(asset_id, currentBuyCount + 1);
        this.totalBuys += 1;
        this.lastBuyTimestamp.set(asset_id, now);

        try {
            var response; 

            if (this.mode != MODES.LIMIT) {
                console.log(`Executing BUY trade for ${asset_id} at price ${markPrice} and size ${size}. Buy count: ${this.buyOrderCountPerToken.get(asset_id)}/${this.MAX_BUYS_PER_TOKEN}`);
                response = await this.clobClient.createAndPostMarketOrder(
                    {
                        tokenID: asset_id,
                        side: Side.BUY,
                        amount: size,
                        price: 0.80, // worst-price limit (slippage protection)
                    },
                    { tickSize: "0.01", negRisk: false },
                    OrderType.FAK,	//Fill-Or-Kill — must fill immediately and entirely, or cancel
                );
            }

            else{
                console.log(`Executing LIMIT BUY trade for ${asset_id} at price 0.30 and size ${size}. Buy count: ${this.buyOrderCountPerToken.get(asset_id)}/${this.MAX_BUYS_PER_TOKEN}`);
                response = await this.clobClient.createAndPostOrder(
                    {
                        tokenID: asset_id,
                        side: Side.BUY,
                        size: size,
                        price: 0.30,
                    },
                );
            }

            console.log("Buy Order ID:", response.orderID);

            if (response.status == 400){
                throw new Error("Buy trade failed with status 400");
            }

        } catch (err) {
            console.error("Buy trade failed:", err);
            // Retry logic if failed
            this.buyOrderCountPerToken.set(asset_id, this.buyOrderCountPerToken.get(asset_id)! - 1);
            this.totalBuys -= 1;                                            
            this.lastBuyTimestamp.set(asset_id, lastBuy);
        }
        this.activeBuyOrders.delete(asset_id);
    }

    private async executeSellTrade(asset_id: string, markPrice: number, size: number, entryPrice: number) {
        // console.log(`Attempting to sell ${asset_id}...`);
        if (this.activeSellOrders.has(asset_id)) {
            //console.log(`Sell already in progress or completed for ${asset_id}, skipping`);
            return;
        }

        // Check if we've exceeded max sells for this token
        const currentSellCount = this.sellOrderCountPerToken.get(asset_id) || 0;
        if (currentSellCount >= this.MAX_SELLS_PER_TOKEN) {
            //console.log(`Max sell orders (${this.MAX_SELLS_PER_TOKEN}) reached for token ${asset_id}, skipping sell`);
            return;
        }

        const now = Date.now();
        const lastSell = this.lastSellTimestamp.get(asset_id) || 0;

        if (now - lastSell < this.SELL_COOLDOWN_MS) {
            //console.log(`Cooldown active for ${asset_id}, skipping sell`);
            return;
        }

        this.activeSellOrders.add(asset_id);
        this.sellOrderCountPerToken.set(asset_id, currentSellCount + 1);  
        this.totalSells += 1;
        this.removePosition(asset_id, size, entryPrice);

        this.lastSellTimestamp.set(asset_id, now);
       
        var pnl = (markPrice - entryPrice) * size - 0.06; // Subtracting estimated fees for buy and sell
        this.intervalRealizedPnL += pnl;

        try {
            const truncated_size = Math.floor(size * 100) / 100;
            var response;

            if (this.mode != MODES.LIMIT) {
                console.log(`Executing trade for ${asset_id} at price ${markPrice} and size ${truncated_size}. Sell count: ${this.sellOrderCountPerToken.get(asset_id)}/${this.MAX_SELLS_PER_TOKEN}`);
                response = await this.clobClient.createAndPostMarketOrder(
                    {
                        tokenID: asset_id,
                        side: Side.SELL,
                        amount: truncated_size, 
                        price: 0.05, //worst-price limit (slippage protection)

                    },
                    { tickSize: "0.01", negRisk: false },
                    OrderType.FAK, //Fill-And-Kill — fill as much as possible immediately, and cancel any unfilled portion
                );
            }

            else{
                this.limitSellActive.add(asset_id);
                console.log(`Executing LIMIT SELL trade for ${asset_id} at price ${entryPrice*1.4} and size ${this.BUY_SIZE-0.01}. Sell count: ${this.sellOrderCountPerToken.get(asset_id)}/${this.MAX_SELLS_PER_TOKEN}`);
                this.clobClient.cancelAll();
                response = await this.clobClient.createAndPostOrder(
                    {
                        tokenID: asset_id,
                        side: Side.SELL,
                        size: this.BUY_SIZE-0.01,
                        price: entryPrice*1.4, // Target 15% profit
                    }
                );
            }



            if (response && response.status == 400){
                throw new Error("Sell trade failed with status 400.");
            }
            

        } catch (err) {
            console.error("Trade failed:", err);
            this.addPosition(asset_id, entryPrice, size);
            this.sellOrderCountPerToken.set(asset_id, this.sellOrderCountPerToken.get(asset_id)! - 1);
            this.totalSells -= 1;
            this.intervalRealizedPnL -= pnl;
            //this.lastSellTimestamp.set(asset_id, lastSell); // (e.g., keep cooldown in case of failure too to prevent rapid retries)
        }
        this.activeSellOrders.delete(asset_id);
        console.log(`[REALIZED] PnL: ${pnl.toFixed(2)}`);

}

    /**
     * Add a position to track
     */
    public addPosition(token_id: string, entryPrice: number, size: number) {
        const positionsPerTokenArray = this.positions.get(token_id) || [];
        positionsPerTokenArray.push({ entryPrice, size });
        this.positions.set(token_id, positionsPerTokenArray);
        if(size !== -1){
            console.log(`Added position: ${token_id} @ ${entryPrice}, size: ${size}. Positions for token: ${positionsPerTokenArray.filter(p => p.size !== -1).length}. Total positions: ${Array.from(this.positions.values()).reduce((sum, arr) => sum + arr.filter(p => p.size !== -1).length, 0)}`);
        }
    }

    /**
     * Remove a specific position for a token by size and entry price
     */
    private removePosition(asset_id: string, size: number, entryPrice: number) {
        const positionsPerTokenArray = this.positions.get(asset_id);
        if (positionsPerTokenArray) {
            const index = positionsPerTokenArray.findIndex(p => p.size === size && p.entryPrice === entryPrice);
            if (index !== -1) {
                positionsPerTokenArray.splice(index, 1);
                console.log(`Removed position for ${asset_id} (size: ${size}, entryPrice: ${entryPrice}). Remaining positions for token: ${positionsPerTokenArray.filter(p => p.size !== -1).length}. Total remaining positions: ${Array.from(this.positions.values()).reduce((sum, arr) => sum + arr.filter(p => p.size !== -1).length, 0)}`);
            }
            // Delete token from map if no positions left
            if (positionsPerTokenArray.length === 0) {
                this.positions.delete(asset_id);
            }
        }
    }


    private secondsToNext5Min(): number {
        const now = new Date();
        const currentMinutes = now.getMinutes();
        const currentSeconds = now.getSeconds();
        
        const nextIntervalMinutes = Math.ceil(currentMinutes / 5) * 5;
        const minutesToNext = nextIntervalMinutes === currentMinutes ? 5 : nextIntervalMinutes - currentMinutes;
        const secondsToNext = minutesToNext * 60 - currentSeconds;
        return secondsToNext;
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
