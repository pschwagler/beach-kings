import { CheckCircle, LogOut } from "lucide-react";
import "../WhatsAppPage.css";

function ConnectionStatus({ clientInfo, onLogout }) {
  return (
    <div className="whatsapp-success-box">
      <div className="whatsapp-success-content">
        <CheckCircle size={24} color="#4caf50" />
        <div>
          <div className="whatsapp-connected-title">
            Connected to WhatsApp
          </div>
          {clientInfo && (
            <div className="whatsapp-client-info">
              {clientInfo.pushname} • {clientInfo.phone}
            </div>
          )}
        </div>
      </div>
      <button onClick={onLogout} className="whatsapp-logout-btn">
        <LogOut size={16} />
        Logout
      </button>
    </div>
  );
}

export default ConnectionStatus;
