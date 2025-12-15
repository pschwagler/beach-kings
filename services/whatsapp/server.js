import express from "express";
import cors from "cors";
import clientManager from "./WhatsAppClientManager.js";

const app = express();
// Use WHATSAPP_PORT instead of PORT to avoid conflicts with Railway's PORT env var
const PORT = process.env.WHATSAPP_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes

// Health check - basic service status
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "whatsapp-service",
    timestamp: new Date().toISOString(),
  });
});

// Health check - detailed WhatsApp status
app.get("/health/whatsapp", (req, res) => {
  const status = clientManager.getStatus();
  
  res.json({
    status: status.isReady ? "healthy" : "initializing",
    service: "whatsapp-service",
    whatsapp: {
      isReady: status.isReady,
      isAuthenticating: status.isAuthenticating,
      isInitializing: status.isInitializing,
      hasQrCode: status.hasQrCode,
      clientInfo: status.clientInfo,
    },
    timestamp: new Date().toISOString(),
  });
});

// Get QR code for authentication
app.get("/api/whatsapp/qr", (req, res) => {
  const qrData = clientManager.getQRCode();
  res.json(qrData);
});

// Get authentication status (NO side effects - pure GET)
app.get("/api/whatsapp/status", (req, res) => {
  const status = clientManager.getStatus();
  res.json(status);
});

// Initialize/reinitialize client
app.post("/api/whatsapp/initialize", async (req, res) => {
  console.log("📥 Initialize endpoint called");

  try {
    const result = await clientManager.initialize();
    res.json(result);
  } catch (error) {
    console.error("❌ Error in initialize endpoint:", error);
    res.status(500).json({
      success: false,
      message: `Initialization error: ${error.message}`,
    });
  }
});

// Logout and clear session
app.post("/api/whatsapp/logout", async (req, res) => {
  console.log("🚪 LOGOUT ENDPOINT CALLED");
  console.log("Request from:", req.ip);
  console.log("User-Agent:", req.get("User-Agent"));

  try {
    await clientManager.logout();
    res.json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("❌ Error during logout:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Error during logout",
    });
  }
});

// Get all group chats
app.get("/api/whatsapp/groups", async (req, res) => {
  try {
    const groups = await clientManager.getGroups();
    res.json({
      success: true,
      groups: groups,
    });
  } catch (error) {
    console.error("Error fetching groups:", error);
    const statusCode = error.message === "WhatsApp client is not ready" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Error fetching group chats",
    });
  }
});

// Send a test message
app.post("/api/whatsapp/send", async (req, res) => {
  const { phoneNumber, message, chatId } = req.body;

  // Validate input
  if (!message) {
    return res.status(400).json({
      success: false,
      message: "Message is required",
    });
  }

  if (!phoneNumber && !chatId) {
    return res.status(400).json({
      success: false,
      message: "Either phoneNumber or chatId is required",
    });
  }

  try {
    const result = await clientManager.sendMessage(phoneNumber, chatId, message);
    res.json({
      success: true,
      message: "Message sent successfully",
      messageId: result.messageId,
    });
  } catch (error) {
    console.error("Error sending message:", error);
    const statusCode = error.message === "WhatsApp client is not ready" ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Error sending message",
    });
  }
});

// Error handling middleware (must be last)
app.use((err, req, res, next) => {
  console.error("❌ Express Error Handler:");
  console.error("Path:", req.path);
  console.error("Error:", err);
  console.error("Stack:", err.stack);

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp service running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on("SIGINT", async () => {
  console.log("\nShutting down gracefully...");
  await clientManager.destroy();
  process.exit(0);
});

// Global error handlers
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
  console.error("Stack trace:", error.stack);
  // Don't exit - let the service try to recover
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("❌ Unhandled Promise Rejection at:", promise);
  console.error("Reason:", reason);
  if (reason instanceof Error) {
    console.error("Stack trace:", reason.stack);
  }
  // Don't exit - let the service try to recover
});
