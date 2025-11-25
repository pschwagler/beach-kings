import { useState, useEffect } from 'react';

/**
 * Hook for managing message state (success/error messages)
 * Automatically dismisses messages after a timeout
 * @param {number} timeout - Time in milliseconds before auto-dismiss (default: 5000)
 * @returns {Array} [message, showMessage, clearMessage]
 */
export function useMessage(timeout = 5000) {
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
      }, timeout);
      return () => clearTimeout(timer);
    }
  }, [message, timeout]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
  };

  const clearMessage = () => {
    setMessage(null);
  };

  return [message, showMessage, clearMessage];
}


