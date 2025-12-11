import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";

console.log("🚀 Starting WhatsApp REPL...");
console.log("📂 Using session from: ./.wwebjs_auth");
console.log("");

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: "./.wwebjs_auth",
    clientId: "beach-volleyball-elo",
  }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

client.on("qr", (qr) => {
  console.log("\n📱 Scan this QR code with WhatsApp:\n");
  qrcode.generate(qr, { small: true });
  console.log("\n⏳ Waiting for scan...\n");
});

client.on("loading_screen", (percent, message) => {
  console.log(`📂 Loading session... ${percent}% ${message}`);
});

client.on("authenticated", () => {
  console.log("✅ Authenticated!");
});

client.on("auth_failure", (msg) => {
  console.error("❌ Authentication failed:", msg);
  process.exit(1);
});

client.on("disconnected", (reason) => {
  console.error("❌ Client disconnected:", reason);
  process.exit(1);
});

client.on("ready", async () => {
  console.log("✅ WhatsApp client is ready!\n");
  
  const info = await client.info;
  console.log("📱 Connected as:", info.pushname);
  console.log("📞 Phone:", info.wid.user);
  console.log("");
  
  console.log("📚 Quick Start Guide:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("📋 List all groups:");
  console.log("  const chats = await client.getChats()");
  console.log("  const groups = chats.filter(c => c.isGroup)");
  console.log("  groups.map(g => ({ name: g.name, id: g.id._serialized }))");
  console.log("");
  console.log("💬 Send message to individual:");
  console.log("  await client.sendMessage('1234567890@c.us', 'Hello!')");
  console.log("");
  console.log("👥 Send message to group:");
  console.log("  await client.sendMessage(groups[0].id._serialized, 'Hi group!')");
  console.log("");
  console.log("🔍 Get contacts:");
  console.log("  const contacts = await client.getContacts()");
  console.log("");
  console.log("ℹ️  Client info:");
  console.log("  client.info");
  console.log("");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("");
  console.log("🎯 The 'client' object is available globally");
  console.log("🚪 Press Ctrl+C twice to exit\n");
  
  // Make client available globally
  global.client = client;
  
  // Start REPL
  const repl = await import('repl');
  const replServer = repl.start({
    prompt: 'whatsapp> ',
    useGlobal: true,
  });
  
  replServer.context.client = client;
  
  // Convenience functions
  replServer.context.getGroups = async () => {
    const chats = await client.getChats();
    return chats.filter(c => c.isGroup);
  };
  
  replServer.context.getChats = async () => {
    return await client.getChats();
  };
  
  replServer.context.send = async (chatId, message) => {
    return await client.sendMessage(chatId, message);
  };
  
  console.log("💡 Bonus helper functions added:");
  console.log("  await getGroups()  - Get all group chats");
  console.log("  await getChats()   - Get all chats");
  console.log("  await send(id, msg) - Send a message");
  console.log("");
  
  // Handle exit
  replServer.on('exit', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await client.destroy();
    process.exit(0);
  });
});

// Initialize
client.initialize();

// Handle Ctrl+C
process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down gracefully...');
  if (client) {
    await client.destroy();
  }
  process.exit(0);
});

