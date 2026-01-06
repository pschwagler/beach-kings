import { RefreshCw } from "lucide-react";
import "../WhatsAppPage.css";

function LoadingSpinner({ message = "Loading WhatsApp service..." }) {
  return (
    <div className="whatsapp-loading">
      <RefreshCw size={48} className="spin" />
      <p className="whatsapp-loading-text">{message}</p>
    </div>
  );
}

export default LoadingSpinner;
