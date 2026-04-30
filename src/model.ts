/**
 * API key credentials for CLOB authentication.
 */
export interface ClobApiKeyCreds {
    /** API key used for authentication */
    key: string;

    /** API secret associated with the key */
    secret: string;

    /** Passphrase required for authentication */
    passphrase: string;
}

/**
 * Authentication details for Gamma authentication.
 */
export interface GammaAuth {
    /** Address used for authentication */
    address: string;
}

/**
 * Message structure for subscription requests.
 */
export interface SubscriptionMessage {
    subscriptions: {
        /** Topic to subscribe to */
        topic?: string;

        auth?: object ;

        /** Type of subscription */
        type: string;

        markets?: string[]; // Optional list of market IDs to filter the subscription

        assets_ids?: string[]; // Optional list of asset IDs to filter the subscription

        /** Optional flag to enable custom features for the subscription */
        custom_feature_enabled?: boolean;

        /** Optional filters for the subscription */
        filters?: string;

        /** Optional CLOB authentication credentials */
        clob_auth?: ClobApiKeyCreds;

        /** Optional Gamma authentication credentials */
        gamma_auth?: GammaAuth;
    }[];
}

/**
 * Represents a real-time message received from the WebSocket server.
 */
export interface Message {
    /** Topic of the message */
    topic: string;

    /** Type of the message */
    type: string;

    /** Timestamp of when the message was sent */
    timestamp: number;

    /** Payload containing the message data */
    payload: object;

    /** Connection ID */
    connection_id: string;
}

export interface UserMessage {
    asset_id: string;
    bucket_index: number;
    event_type: string; // e.g. "trade"
    fee_rate_bps: string;

    id: string;
    last_update: string;

    maker_address: string;
    maker_orders: MakerOrder[];

    market: string;
    match_time: string;

    outcome: string; // "Yes" | "No" (can tighten later)
    owner: string;

    price: string;
    side: "BUY" | "SELL";

    size: string;
    status: string; // "MATCHED" etc.

    taker_order_id: string;
    timestamp: string;

    trade_owner: string;
    trader_side: "MAKER" | "TAKER";

    transaction_hash: string;

    type: "TRADE"; // strict since your example shows this
}

export interface MakerOrder {
    // You didn’t show full structure, so keep flexible for now
    [key: string]: any;
}




export interface MarketMessage {
    market: string;

    price_changes: PriceChange[];

    timestamp: string; // comes as string (ms epoch)
    event_type: string;
}

export interface PriceChange {
    asset_id: string;

    price: string;     // keep as string (precision-safe)
    size: string;

    side: "BUY" | "SELL";

    hash: string;

    best_bid: string;
    best_ask: string;
}


/**
 * Represents websocket connection status
 */
export enum ConnectionStatus {
    CONNECTING = "CONNECTING",
    CONNECTED = "CONNECTED",
    DISCONNECTED = "DISCONNECTED",
}
