# WhatsApp Service

> **⚠️ INACTIVE** - This service is currently inactive. `whatsapp-web.js` has been uninstalled.

This is a Node.js service that provides WhatsApp Web integration using `whatsapp-web.js`.

## Features

- QR Code authentication for WhatsApp Web
- Send messages to WhatsApp numbers
- Check authentication status
- Persistent session storage

## Setup

### 1. Install Dependencies

```bash
cd whatsapp-service
npm install
```

### 2. Start the Service

```bash
npm start
```

The service will run on `http://localhost:3001`.

## API Endpoints

### Health Check
```
GET /health
```

### Get QR Code for Authentication
```
GET /api/whatsapp/qr
```

Returns the QR code as a data URL to scan with WhatsApp mobile app.

### Get Status
```
GET /api/whatsapp/status
```

Returns current authentication status:
- `isReady`: Whether the client is authenticated and ready
- `isAuthenticating`: Whether authentication is in progress
- `hasQrCode`: Whether a QR code is available
- `clientInfo`: Connected account information (when authenticated)

### Initialize Client
```
POST /api/whatsapp/initialize
```

Starts the WhatsApp client initialization process.

### Logout
```
POST /api/whatsapp/logout
```

Logs out and clears the stored session.

### Send Message
```
POST /api/whatsapp/send
Content-Type: application/json

{
  "phoneNumber": "15551234567",
  "message": "Hello from QBK Beach Volleyball!"
}
```

Sends a WhatsApp message to the specified phone number.

**Phone Number Format:**
- Include country code (e.g., `1` for US, `44` for UK)
- Example: `15551234567` (1 = US country code, 5551234567 = phone number)

## How to Use

1. Start the service: `npm start`
2. Navigate to `/whatsapp` in the frontend app
3. Scan the QR code with your WhatsApp mobile app:
   - Open WhatsApp on your phone
   - Go to Settings → Linked Devices
   - Tap "Link a Device"
   - Scan the QR code displayed in the browser
4. Once authenticated, you can send test messages

## Session Persistence

The service uses `LocalAuth` strategy which stores session data in `.wwebjs_auth/` directory. This means you won't need to scan the QR code every time you restart the service (unless the session expires).

## Troubleshooting

### QR Code Not Showing
- Make sure the service is running on port 3001
- Check the console logs for errors
- Try clicking "Initialize WhatsApp" button

### "Number not registered on WhatsApp"
- Verify the phone number format includes the country code
- Make sure the number is actually registered on WhatsApp

### Session Expired
- Click the logout button and scan a new QR code

## Notes

- The service requires an active internet connection
- WhatsApp may limit the number of messages you can send
- This is intended for testing and notifications, not mass messaging

