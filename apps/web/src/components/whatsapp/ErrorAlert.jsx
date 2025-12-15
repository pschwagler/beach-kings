import { AlertCircle } from "lucide-react";
import "../WhatsAppPage.css";

function ErrorAlert({ error, serviceUnavailable }) {
  if (!error) return null;

  return (
    <div className={`whatsapp-alert ${serviceUnavailable ? 'whatsapp-alert-warning' : 'whatsapp-alert-error'}`}>
      <div className="whatsapp-alert-content">
        <AlertCircle size={24} color={serviceUnavailable ? "#ff9800" : "#c00"} />
        <div className="whatsapp-alert-body">
          <div className={`whatsapp-alert-title ${serviceUnavailable ? 'whatsapp-alert-title-warning' : 'whatsapp-alert-title-error'}`}>
            {serviceUnavailable ? "⚠️ Service Unavailable" : "Error"}
          </div>
          <div className="whatsapp-alert-message">
            {error}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ErrorAlert;

