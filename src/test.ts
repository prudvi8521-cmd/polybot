import WebSocket from "ws";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/user";

const ws = new WebSocket(WS_URL);

ws.on("open", () => {
  console.log("✅ Connected");

  const authMessage = {
    type: "user",
    "auth": {
                    "apiKey": "c891a957-bc4b-d52b-113a-5eae9ccb1b7a",
                    "secret": 'C_hHBRdRIjCFvwfC8xIYn-AOOMFvO7G1PoGzjDbdUp4=',
                    "passphrase": "927e1c297e545fafa3c44db79b2927fa09c5dcace9b95e91485dc428ddc3eda8",
                },
  };

  ws.send(JSON.stringify(authMessage));
});

ws.on("message", (data) => {
  try {
    const msg = JSON.parse(data.toString());
    console.log("📩 Message:", msg);
  } catch {
    console.log("📩 Raw message:", data.toString());
  }
});

ws.on("error", (err) => {
  console.error("❌ Error:", err.message);
});

ws.on("close", () => {
  console.log("🔌 Disconnected");
});