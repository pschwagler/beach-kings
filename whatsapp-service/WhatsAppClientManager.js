import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode";

/**
 * WhatsApp client status enum
 */
const ClientStatus = {
  DISCONNECTED: 'DISCONNECTED',
  INITIALIZING: 'INITIALIZING',
  AUTHENTICATING: 'AUTHENTICATING',
  READY: 'READY',
};

/**
 * WhatsAppClientManager - Singleton class to manage WhatsApp client lifecycle
 * 
 * Handles:
 * - Client initialization with proper mutex/locking
 * - State management
 * - Event handling
 * - QR code generation
 */
class WhatsAppClientManager {
  constructor() {
    // Client instance
    this.client = null;
    
    // State
    this.status = ClientStatus.DISCONNECTED;
    this.qrCodeData = null;
    this.clientInfo = null;
    this.lastError = null;
    
    // Initialization
    this.initializationPromise = null;
    
    // Tracking/debugging
    this.currentClientId = null;

    // Auto-initialize on construction
    this.initialize().catch((err) => {
      console.error("⚠️  Auto-initialization failed:", err);
      this.lastError = err.message || "Unknown initialization error";
      // Don't crash the server, client can be manually initialized later
    });
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      status: this.status,
      clientInfo: this.status === ClientStatus.READY ? this.clientInfo : null,
      error: this.lastError,
    };
  }

  /**
   * Get QR code data
   */
  getQRCode() {
    if (this.status === ClientStatus.READY) {
      return {
        authenticated: true,
        qrCode: null,
        message: "Already authenticated",
        clientInfo: this.clientInfo,
      };
    }

    if (this.qrCodeData) {
      return {
        authenticated: false,
        qrCode: this.qrCodeData,
        message: "Scan QR code to authenticate",
      };
    }

    const messages = {
      [ClientStatus.DISCONNECTED]: 'Not connected',
      [ClientStatus.INITIALIZING]: 'Initializing WhatsApp client...',
      [ClientStatus.AUTHENTICATING]: 'Generating QR code...',
    };

    return {
      authenticated: false,
      qrCode: null,
      message: messages[this.status] || 'Initializing...',
    };
  }

  /**
   * Initialize WhatsApp client (singleton with mutex)
   * Returns a promise that resolves when initialization is complete
   */
  async initialize() {
    // If already ready, return immediately
    if (this.status === ClientStatus.READY && this.client) {
      console.log("✅ Client already ready");
      return { success: true, message: "Client already ready" };
    }

    // If currently initializing, wait for that to complete
    if (this.initializationPromise) {
      console.log("⏳ Initialization already in progress, waiting...");
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._doInitialize();
    
    try {
      const result = await this.initializationPromise;
      // Clear any previous errors on success
      this.lastError = null;
      return result;
    } catch (err) {
      // Return error info instead of throwing (for API calls)
      return {
        success: false,
        message: `Initialization failed: ${err.message}`,
        error: err.message,
      };
    } finally {
      // Clear the promise so future calls can retry if needed
      this.initializationPromise = null;
    }
  }

  /**
   * Internal initialization logic
   */
  async _doInitialize() {
    console.log("📞 Starting WhatsApp client initialization...");

    // Generate unique client ID for tracking
    this.currentClientId = this._createClientId();
    console.log(`🆔 Client ID: ${this.currentClientId}`);
    console.log("📂 Session data path: ./.wwebjs_auth");

    // Set initialization state
    this.status = ClientStatus.INITIALIZING;
    this.qrCodeData = null;

    try {
      // Create new client
      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: "./.wwebjs_auth",
          clientId: "beach-volleyball-elo",
        }),
        puppeteer: {
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--single-process",
            "--disable-gpu",
            // Force new session, ignore lock files from crashed processes
            "--disable-session-crashed-bubble",
            "--disable-breakpad",
          ],
        },
      });

      // Set up event handlers
      this._setupEventHandlers();

      // Move to authenticating state
      this.status = ClientStatus.AUTHENTICATING;

      // Initialize the client
      await this.client.initialize();

      console.log(`[${this.currentClientId}] ✅ Client initialization started successfully`);
      
      return {
        success: true,
        message: "Client initialization started",
      };
    } catch (err) {
      console.error(`[${this.currentClientId}] ❌ Error initializing client:`, err);
      
      // Store the error for UI display
      this.lastError = err.message || "Unknown initialization error";
      
      // Reset state on error
      this.status = ClientStatus.DISCONNECTED;
      this.client = null;
      this.currentClientId = null;
      
      throw err; // Re-throw so the caller can handle it
    }
  }

  /**
   * Set up all event handlers for the client
   */
  _setupEventHandlers() {
    // Loading screen (restoring session)
    this.client.on("loading_screen", (percent, message) => {
      console.log(
        `[${this.currentClientId}] 📂 Loading session... ${percent}% ${message}`
      );
    });

    // QR Code event
    this.client.on("qr", async (qr) => {
      console.log(`[${this.currentClientId}] 📱 QR Code received`);
      try {
        this.qrCodeData = await qrcode.toDataURL(qr);
        this.status = ClientStatus.AUTHENTICATING;
        console.log(`[${this.currentClientId}] ✅ QR Code converted to data URL`);
      } catch (err) {
        console.error(`[${this.currentClientId}] ❌ Error generating QR code:`, err);
      }
    });

    // Ready event - use .once() to prevent duplicate events
    this.client.once("ready", async () => {
      console.log(`[${this.currentClientId}] 🟢 WhatsApp client is ready!`);

      this.status = ClientStatus.READY;
      this.qrCodeData = null;
      this.lastError = null; // Clear any previous errors

      // Get client info
      try {
        const info = await this.client.info;
        this.clientInfo = {
          pushname: info.pushname,
          phone: info.wid.user,
          platform: info.platform,
        };
        console.log(`[${this.currentClientId}] 📱 Client info:`, this.clientInfo);
      } catch (err) {
        console.error(`[${this.currentClientId}] ❌ Error getting client info:`, err);
        // Set basic info even if we can't get details
        this.clientInfo = {
          pushname: "WhatsApp User",
          phone: "Connected",
          platform: "unknown",
        };
      }
    });

    // Authentication event - use .once()
    this.client.once("authenticated", (session) => {
      console.log(`[${this.currentClientId}] ✅ Authenticated successfully`);
      console.log(`[${this.currentClientId}] 📱 Session saved to .wwebjs_auth/`);
      // Stay in AUTHENTICATING state until ready event fires
    });

    // Authentication failure
    this.client.on("auth_failure", (msg) => {
      console.error(`[${this.currentClientId}] ❌ Authentication failure:`, msg);
      this.status = ClientStatus.DISCONNECTED;
      this.qrCodeData = null;
      this.lastError = `Authentication failed: ${msg}`;
    });

    // Disconnected event
    this.client.on("disconnected", (reason) => {
      console.error(`[${this.currentClientId}] ❌ Client disconnected:`, reason);
      console.error("⚠️  You will need to re-scan QR code or reinitialize");

      // Clear all state
      this.status = ClientStatus.DISCONNECTED;
      this.qrCodeData = null;
      this.clientInfo = null;
      this.lastError = `Disconnected: ${reason}`;
      this.client = null;
      this.currentClientId = null;
    });
  }

  /**
   * Get all group chats
   */
  async getGroups() {
    if (this.status !== ClientStatus.READY || !this.client) {
      throw new Error("WhatsApp client is not ready");
    }

    const chats = await this.client.getChats();

    // Filter for group chats only
    const groups = chats
      .filter((chat) => chat.isGroup)
      .map((group) => ({
        id: group.id._serialized,
        name: group.name,
        participantCount: group.participants ? group.participants.length : 0,
      }));

    console.log(`Found ${groups.length} group chats`);
    return groups;
  }

  /**
   * Send a message to a phone number or chat
   */
  async sendMessage(phoneNumber, chatId, message) {
    if (this.status !== ClientStatus.READY || !this.client) {
      throw new Error("WhatsApp client is not ready");
    }

    let targetChatId;

    // Use chatId if provided (for groups), otherwise format phone number
    if (chatId) {
      targetChatId = chatId;
      console.log(`Sending message to chat ${chatId}`);
    } else if (phoneNumber) {
      // Format phone number (remove non-digits and ensure proper format)
      let formattedNumber = phoneNumber.replace(/\D/g, "");

      // Add country code if not present (assuming US for now)
      if (formattedNumber.length === 10) {
        formattedNumber = "1" + formattedNumber;
      }

      // WhatsApp ID format: number@c.us
      targetChatId = `${formattedNumber}@c.us`;

      console.log(`Sending message to ${targetChatId}`);

      // Check if number exists on WhatsApp
      const isRegistered = await this.client.isRegisteredUser(targetChatId);

      if (!isRegistered) {
        throw new Error("This phone number is not registered on WhatsApp");
      }
    } else {
      throw new Error("Either phoneNumber or chatId is required");
    }

    // Send the message
    const response = await this.client.sendMessage(targetChatId, message);
    console.log("Message sent successfully:", response.id);

    return {
      success: true,
      messageId: response.id._serialized,
    };
  }

  /**
   * Logout and destroy the client
   */
  async logout() {
    if (!this.client) {
      throw new Error("No active client to logout");
    }

    console.log("🚪 Logging out...");
    await this.client.logout();
    await this.client.destroy();

    // Clear all state
    this.client = null;
    this.status = ClientStatus.DISCONNECTED;
    this.qrCodeData = null;
    this.clientInfo = null;
    this.currentClientId = null;

    console.log("✅ Logout completed successfully");
  }

  /**
   * Destroy the client (for graceful shutdown)
   */
  async destroy() {
    if (this.client) {
      await this.client.destroy();
      this.client = null;
    }
  }

  _createClientId() {
    return `client-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  } 
}

// Export singleton instance (auto-initializes in constructor)
export default new WhatsAppClientManager();

