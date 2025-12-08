import { useState, useEffect } from "react";
import { useWhatsAppStatus } from "../hooks/useWhatsAppStatus";
import ErrorAlert from "./whatsapp/ErrorAlert";
import LoadingSpinner from "./whatsapp/LoadingSpinner";
import ConnectionStatus from "./whatsapp/ConnectionStatus";
import GroupSelector from "./whatsapp/GroupSelector";
import QRCodeDisplay from "./whatsapp/QRCodeDisplay";
import "../App.css";
import "./WhatsAppPage.css";

function WhatsAppPage() {
  // Use custom hook for status management
  const {
    qrCode,
    isAuthenticated,
    isLoading,
    clientInfo,
    error,
    serviceUnavailable,
    groups,
    loadingGroups,
    status,
    initError,
    handleLogout,
    handleRetry,
    fetchGroups,
    setError,
  } = useWhatsAppStatus();

  // Local component state
  const [selectedGroup, setSelectedGroup] = useState("");
  const [configLoaded, setConfigLoaded] = useState(false);

  // Load saved group configuration when authenticated
  useEffect(() => {
    if (isAuthenticated && !configLoaded) {
      fetch('/api/whatsapp/config')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.group_id) {
            setSelectedGroup(data.group_id);
          }
          setConfigLoaded(true);
        })
        .catch(err => {
          console.error("Error loading config:", err);
          setConfigLoaded(true);
        });
    }
  }, [isAuthenticated, configLoaded]);

  const handleGroupChange = async (e) => {
    const newGroupId = e.target.value;
    setSelectedGroup(newGroupId);
    
    // Save to backend if a group is selected
    if (newGroupId) {
      try {
        await fetch('/api/whatsapp/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group_id: newGroupId }),
        });
      } catch (err) {
        console.error("Error saving config:", err);
      }
    }
  };

  const handleLogoutClick = async () => {
    const result = await handleLogout();
    setSelectedGroup("");
    setConfigLoaded(false);
  };

  return (
    <>
      <div className="whatsapp-container">
        <div className="whatsapp-header">
          <h1 className="whatsapp-title">
            🏐 WhatsApp Integration
          </h1>
          <p className="whatsapp-subtitle">
            Configure automated notifications for new player signups
          </p>
        </div>

        <ErrorAlert error={error} serviceUnavailable={serviceUnavailable} />

        {serviceUnavailable ? (
          // Don't show anything else if service is unavailable - error message is enough
          null
        ) : initError && status === 'DISCONNECTED' ? (
          // Show error and retry button for initialization failures
          <div className="whatsapp-error-container">
            <div className="alert alert-error">
              <h3>⚠️ Initialization Failed</h3>
              <p className="error-message">{initError}</p>
              <p className="error-hint">
                This usually happens when the previous session didn't close properly. 
                Try clicking "Retry" to reinitialize the WhatsApp client.
              </p>
            </div>
            <button 
              className="retry-button"
              onClick={handleRetry}
              disabled={isLoading}
            >
              {isLoading ? "Retrying..." : "🔄 Retry Initialization"}
            </button>
          </div>
        ) : isLoading && !qrCode && !isAuthenticated ? (
          <LoadingSpinner />
        ) : isAuthenticated ? (
          <div>
            <ConnectionStatus 
              clientInfo={clientInfo} 
              onLogout={handleLogoutClick} 
            />
            <GroupSelector
              groups={groups}
              loadingGroups={loadingGroups}
              selectedGroup={selectedGroup}
              onGroupChange={handleGroupChange}
            />
          </div>
        ) : (
          <QRCodeDisplay qrCode={qrCode} isLoading={isLoading} />
        )}
      </div>
    </>
  );
}

export default WhatsAppPage;
