import { useState, useCallback } from 'react';

/**
 * Hook for managing player panel state and handlers
 * Centralizes the logic for opening/closing the player details panel
 * and handling player selection changes
 * @param {Object} options - Configuration options
 * @param {Function} options.onPlayerSelect - Callback when a player is selected
 * @returns {Object} Player panel state and handlers
 */
export function usePlayerPanel({ onPlayerSelect }) {
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  const openPanel = useCallback(() => {
    setIsPanelOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    setIsPanelOpen(false);
  }, []);

  const togglePanel = useCallback(() => {
    setIsPanelOpen(prev => !prev);
  }, []);

  const handlePlayerClick = useCallback((playerId, playerName) => {
    if (onPlayerSelect) {
      onPlayerSelect(playerId, playerName);
    }
    // Open panel after a short delay to allow state to update
    setTimeout(() => setIsPanelOpen(true), 10);
  }, [onPlayerSelect]);

  const handleSideTabClick = useCallback((onFallbackSelect) => {
    if (isPanelOpen || !onFallbackSelect) {
      setIsPanelOpen(true);
      return;
    }
    // Fallback to selecting a default player if none selected
    onFallbackSelect();
  }, [isPanelOpen]);

  return {
    isPanelOpen,
    setIsPanelOpen,
    openPanel,
    closePanel,
    togglePanel,
    handlePlayerClick,
    handleSideTabClick,
  };
}

