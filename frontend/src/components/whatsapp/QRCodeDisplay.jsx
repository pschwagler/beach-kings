import { QrCode, RefreshCw } from "lucide-react";
import "../WhatsAppPage.css";

function QRCodeDisplay({ qrCode, isLoading }) {
  return (
    <div>
      {/* QR Code View */}
      <div className="whatsapp-qr-box">
        <QrCode size={48} className="whatsapp-qr-icon" />
        <h2 className="whatsapp-qr-title">
          Scan QR Code to Connect
        </h2>
        <p className="whatsapp-qr-instructions">
          Open WhatsApp on your phone, go to Settings → Linked Devices →
          Link a Device
        </p>

        {qrCode ? (
          <div className="whatsapp-qr-content">
            <img
              src={qrCode}
              alt="WhatsApp QR Code"
              className="whatsapp-qr-image"
            />
            <p className="whatsapp-qr-waiting">
              Waiting for scan...
            </p>
          </div>
        ) : (
          <div className="whatsapp-qr-loading-container">
            <RefreshCw
              size={48}
              className="whatsapp-qr-loading-icon"
            />
            <p className="whatsapp-qr-loading-text">
              {isLoading
                ? "Generating QR code..."
                : "Initializing WhatsApp service..."}
            </p>
            <p className="whatsapp-qr-loading-hint">
              This should only take a few seconds
            </p>
          </div>
        )}
      </div>

      {/* Only show instructions when QR code is displayed */}
      {qrCode && (
        <div className="whatsapp-instructions-box">
          <h3 className="whatsapp-instructions-title">
            📱 How to Connect:
          </h3>
          <ol className="whatsapp-instructions-list">
            <li>Open WhatsApp on your phone</li>
            <li>Tap Menu (⋮) or Settings</li>
            <li>Select "Linked Devices"</li>
            <li>Tap "Link a Device"</li>
            <li>Scan the QR code above</li>
          </ol>
        </div>
      )}
    </div>
  );
}

export default QRCodeDisplay;

