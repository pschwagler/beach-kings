import { useState, useEffect } from 'react';
import { getPlayerStats, getPlayerMatchHistory } from '../services/api';
import { getFirstPlacePlayer } from '../utils/playerUtils';

export function usePlayerDetails(rankings, allPlayerNames, setMessage, matches) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerStats, setPlayerStats] = useState(null);
  const [playerMatchHistory, setPlayerMatchHistory] = useState(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Auto-load first place player data when rankings are available
  useEffect(() => {
    if (rankings.length > 0 && !selectedPlayer) {
      const firstPlacePlayer = getFirstPlacePlayer(rankings);
      if (firstPlacePlayer) {
        // Load player data without opening the panel
        setSelectedPlayer(firstPlacePlayer.Name);
        
        Promise.all([
          getPlayerStats(firstPlacePlayer.Name),
          getPlayerMatchHistory(firstPlacePlayer.Name)
        ]).then(([stats, matchHistory]) => {
          setPlayerStats(stats);
          setPlayerMatchHistory(matchHistory);
        }).catch(error => {
          setMessage({
            type: 'error',
            text: `Error loading player details: ${error.message}`
          });
        });
      }
    }
  }, [rankings, selectedPlayer, setMessage]);

  // Refresh player details when matches change (if a player is selected)
  useEffect(() => {
    if (selectedPlayer && matches) {
      // Silently refresh player data in the background
      Promise.all([
        getPlayerStats(selectedPlayer),
        getPlayerMatchHistory(selectedPlayer)
      ]).then(([stats, matchHistory]) => {
        setPlayerStats(stats);
        setPlayerMatchHistory(matchHistory);
      }).catch(error => {
        console.error('Error refreshing player details:', error);
        setMessage({
          type: 'error',
          text: 'Failed to refresh player details. Please close and reopen the player panel.'
        });
      });
    }
  }, [matches, selectedPlayer, setMessage]);

  const handlePlayerClick = async (playerName) => {
    try {
      setSelectedPlayer(playerName);
      setPlayerStats(null); // Clear previous data
      setPlayerMatchHistory(null);
      
      // Load both stats and match history
      const [stats, matchHistory] = await Promise.all([
        getPlayerStats(playerName),
        getPlayerMatchHistory(playerName)
      ]);
      
      setPlayerStats(stats);
      setPlayerMatchHistory(matchHistory);
      
      // Open the panel after data is loaded
      setTimeout(() => setIsPanelOpen(true), 10);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error loading player details: ${error.message}`
      });
    }
  };

  const handleSideTabClick = () => {
    // If player data is already loaded, just open the panel
    if (selectedPlayer && playerStats) {
      setIsPanelOpen(true);
    } else {
      // Find the first place player and load them
      const firstPlacePlayer = getFirstPlacePlayer(rankings);
      
      if (firstPlacePlayer) {
        handlePlayerClick(firstPlacePlayer.Name);
      } else if (allPlayerNames.length > 0) {
        handlePlayerClick(allPlayerNames[0]);
      }
    }
  };

  const handleClosePlayer = () => {
    setIsPanelOpen(false);
  };

  return {
    selectedPlayer,
    playerStats,
    playerMatchHistory,
    isPanelOpen,
    handlePlayerClick,
    handleSideTabClick,
    handleClosePlayer
  };
}

