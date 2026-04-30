import dotenv from "dotenv";
import { TradingBot } from "../src/bot";

// Load environment variables from .env
dotenv.config();

async function main() {
    try {
        // Create bot with API credentials derived from PRIVATE_KEY in .env
        console.log("Initializing TradingBot...");
        const bot = await TradingBot.create();

        // Start the bot - this connects to WebSocket and subscribes to clob_user
        console.log("Starting bot...");
        bot.start();

        // The bot will automatically:
        // 1. Connect to Polymarket WebSocket
        // 2. Subscribe to clob_user to receive order updates
        // 3. Extract tokens from orders and subscribe to clob_market for each token
        // 4. Listen for book_update messages and evaluate positions
        // 5. Execute trades based on shouldExecuteTrade logic

        // You can also manually add positions if needed
        // bot.addPosition("market-id", 0.50);

        // Keep the process running
        process.on("SIGINT", () => {
            console.log("\nShutting down bot...");
            bot.stop();
            process.exit(0);
        });
    } catch (error) {
        console.error("Error initializing bot:", error);
        process.exit(1);
    }
}

main();
