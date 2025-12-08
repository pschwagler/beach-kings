import { useState, useEffect } from "react";

/**
 * Custom hook for managing WhatsApp status polling
 * 
 * Handles:
 * - Status polling every 3 seconds
 * - QR code fetching
 * - Service availability detection
 * - Authentication state management
 */
export function useWhatsAppStatus() {
  const [qrCode, setQrCode] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [clientInfo, setClientInfo] = useState(null);
  const [error, setError] = useState(null);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [status, setStatus] = useState('DISCONNECTED'); // Track actual status
  const [initError, setInitError] = useState(null); // Track initialization errors

  const WHATSAPP_API_BASE = "/api/whatsapp";

  // Fetch groups
  const fetchGroups = async (force = false) => {
    if (!force && groups.length > 0) return; // Already loaded unless forced
    
    setLoadingGroups(true);
    try {
      const response = await fetch(`${WHATSAPP_API_BASE}/groups`);
      const data = await response.json();

      if (data.success) {
        setGroups(data.groups);
      }
    } catch (err) {
      console.error("Error fetching groups:", err);
    }
    setLoadingGroups(false);
  };

  // Poll for status - simplified with proper dependencies
  useEffect(() => {
    if (serviceUnavailable) return; // Don't poll if service is down

    const checkStatus = async () => {
      try {
        const response = await fetch(`${WHATSAPP_API_BASE}/status`);

        if (response.status === 500 || response.status === 503) {
          setServiceUnavailable(true);
          setError("WhatsApp integration is not configured or unavailable.");
          setIsLoading(false);
          return;
        }

        if (!response.ok) throw new Error(`Status check failed: ${response.status}`);

        const data = await response.json();
        const isReady = data.status === 'READY';
        
        setStatus(data.status); // Store the actual status
        setIsAuthenticated(isReady);
        setClientInfo(data.clientInfo);
        setError(null);
        setServiceUnavailable(false);
        setIsLoading(false);
        
        // Capture initialization errors from backend
        if (data.error) {
          setInitError(data.error);
        } else if (isReady) {
          setInitError(null); // Clear error when ready
        }

        // Auto-fetch groups when ready
        if (isReady) {
          fetchGroups();
        }

        // Auto-fetch QR code when not ready and don't have one
        if (!isReady && !qrCode) {
          const qrResponse = await fetch(`${WHATSAPP_API_BASE}/qr`);
          if (qrResponse.ok) {
            const qrData = await qrResponse.json();
            if (qrData.qrCode) setQrCode(qrData.qrCode);
          }
        }
      } catch (err) {
        console.error("Error checking status:", err);
        if (err.message.includes("Failed to fetch")) {
          setServiceUnavailable(true);
          setError("WhatsApp integration is currently unavailable.");
        }
        setIsLoading(false);
      }
    };

    // Initial check
    checkStatus();

    // Poll every 3 seconds if not authenticated
    const interval = !isAuthenticated ? setInterval(checkStatus, 3000) : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, serviceUnavailable, qrCode, status]);

  const handleRetry = async () => {
    setIsLoading(true);
    setError(null);
    setInitError(null);
    
    try {
      const response = await fetch(`${WHATSAPP_API_BASE}/initialize`, { method: "POST" });
      const data = await response.json();
      
      if (!data.success) {
        setError(data.message || "Initialization failed");
        setInitError(data.error || data.message);
      }
    } catch (err) {
      console.error("Error reinitializing:", err);
      setError("Failed to reinitialize WhatsApp client");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Are you sure you want to logout? You will need to scan the QR code again.")) {
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${WHATSAPP_API_BASE}/logout`, { method: "POST" });
      const data = await response.json();

      if (data.success) {
        setIsAuthenticated(false);
        setClientInfo(null);
        setQrCode(null);
        setGroups([]); // Clearing array allows refetch on next auth
        setInitError(null);
        return { type: "success", message: "Logged out successfully" };
      } else {
        setError(data.message);
        return { type: "error", message: data.message };
      }
    } catch (err) {
      console.error("Error logging out:", err);
      setError("Failed to logout");
      return { type: "error", message: "Failed to logout" };
    } finally {
      setIsLoading(false);
    }
  };

  return {
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
  };
}

