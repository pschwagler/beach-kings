import { useEffect, useCallback } from 'react';
import { useDrawer, DRAWER_TYPES } from '../../../contexts/DrawerContext';
import { transformPlayerData } from '../utils/playerDataUtils';
import { getFirstPlacePlayer } from '../../../utils/playerUtils';

/**
 * Custom hook to manage player details drawer logic
 * Handles auto-selection, opening drawer, player changes, and auto-updating drawer when data changes
 * 
 * @param {Object} config - Configuration object
 * @param {Object} config.seasonData - Season data to use for stats (selectedSeasonData or activeSeasonData)
 * @param {Function} config.getPlayerStats - Function to get player stats: (playerId, seasonData) => stats object OR null if using pre-computed
 * @param {Function} config.getPlayerMatchHistory - Function to get match history: (playerId, seasonData) => match history array OR null if using pre-computed
 * @param {Function} config.getPlayerId - Function to get player ID from name: (playerName) => playerId
 * @param {Array} config.allPlayerNames - Array of all player names for the dropdown
 * @param {string} config.leagueName - League name to display
 * @param {string} config.seasonName - Season name to display
 * @param {number|null} config.selectedPlayerId - Currently selected player ID from context
 * @param {string|null} config.selectedPlayerName - Currently selected player name from context
 * @param {Function} config.setSelectedPlayer - Function to set selected player: (playerId, playerName) => void
 * @param {Object|null} config.precomputedStats - Pre-computed player stats (if not computing on-the-fly)
 * @param {Array|null} config.precomputedMatchHistory - Pre-computed match history (if not computing on-the-fly)
 * @param {boolean} config.autoSelect - Enable auto-selection of default player (default: false)
 * @param {Object|null} config.currentUserPlayer - Current user's player object (for auto-selection)
 * @param {Object|null} config.activeSeason - Active season object (for auto-selection)
 * @param {Array|null} config.rankings - Rankings array (for rankings-based auto-selection)
 * @param {Array|null} config.members - League members array (for matches tab auto-selection)
 * 
 * @returns {Object} Object with handlePlayerClick and handlePlayerChange functions
 */
export function usePlayerDetailsDrawer({
  seasonData,
  getPlayerStats,
  getPlayerMatchHistory,
  getPlayerId,
  allPlayerNames,
  leagueName,
  seasonName,
  selectedPlayerId,
  selectedPlayerName,
  setSelectedPlayer,
  precomputedStats = null,
  precomputedMatchHistory = null,
  autoSelect = false,
  currentUserPlayer = null,
  activeSeason = null,
  rankings = null,
  members = null,
}) {
  const { openDrawer, isOpen, drawerType } = useDrawer();

  // Auto-select default player when data becomes available (if enabled)
  useEffect(() => {
    if (!autoSelect) return;
    
    // Don't auto-select if already selected
    if (selectedPlayerId) return;
    
    // Need season data to proceed
    if (!seasonData?.player_season_stats || !seasonData?.partnership_opponent_stats || !activeSeason) return;

    // Case 1: Rankings-based selection (for RankingsTab)
    if (rankings && rankings.length > 0) {
      let playerToSelect = null;
      
      // Try to find current user's player in rankings first
      if (currentUserPlayer?.id) {
        const currentUserInRankings = rankings.find(r => r.player_id === currentUserPlayer.id);
        if (currentUserInRankings?.player_id) {
          playerToSelect = currentUserInRankings;
        }
      }
      
      // Fall back to first place player if current user not found
      if (!playerToSelect) {
        playerToSelect = getFirstPlacePlayer(rankings) || rankings[0];
      }
      
      if (playerToSelect?.player_id) {
        setSelectedPlayer(playerToSelect.player_id, playerToSelect.Name);
        // Don't auto-open the drawer - let user click to open it
      }
      return;
    }

    // Case 2: Player names-based selection (for MatchesTab)
    if (allPlayerNames && allPlayerNames.length > 0 && getPlayerId) {
      let playerToSelect = null;
      let playerNameToSelect = null;
      
      // Try to find current user's player in the league
      if (currentUserPlayer?.id && members) {
        // Check if current user is a member
        const userMember = members.find(m => m.player_id === currentUserPlayer.id);
        if (userMember) {
          // Find the display name for this player
          const playerName = allPlayerNames.find(name => {
            const id = getPlayerId(name);
            return id === currentUserPlayer.id;
          });
          
          if (playerName) {
            playerToSelect = currentUserPlayer.id;
            playerNameToSelect = playerName;
          }
        }
      }
      
      // Fall back to first player if current user not found
      if (!playerToSelect && allPlayerNames.length > 0) {
        const firstName = allPlayerNames[0];
        const firstId = getPlayerId(firstName);
        if (firstId) {
          playerToSelect = firstId;
          playerNameToSelect = firstName;
        }
      }
      
      if (playerToSelect && playerNameToSelect) {
        setSelectedPlayer(playerToSelect, playerNameToSelect);
        // Don't auto-open the drawer - let user click to open it
      }
    }
  }, [
    autoSelect,
    selectedPlayerId,
    seasonData,
    activeSeason,
    rankings,
    allPlayerNames,
    getPlayerId,
    currentUserPlayer,
    members,
    setSelectedPlayer,
  ]);

  // Helper to compute or get pre-computed player stats
  const computePlayerStats = useCallback((playerId) => {
    if (precomputedStats !== null) {
      return precomputedStats;
    }
    if (getPlayerStats) {
      return getPlayerStats(playerId, seasonData);
    }
    if (seasonData && playerId) {
      const { stats } = transformPlayerData(seasonData, playerId);
      return stats;
    }
    return null;
  }, [seasonData, getPlayerStats, precomputedStats]);

  // Helper to compute or get pre-computed match history
  const computePlayerMatchHistory = useCallback((playerId) => {
    if (precomputedMatchHistory !== null) {
      return precomputedMatchHistory || [];
    }
    if (getPlayerMatchHistory) {
      return getPlayerMatchHistory(playerId, seasonData) || [];
    }
    if (seasonData && playerId) {
      const { matchHistory } = transformPlayerData(seasonData, playerId);
      return matchHistory || [];
    }
    return [];
  }, [seasonData, getPlayerMatchHistory, precomputedMatchHistory]);

  // Handle player change from PlayerSelector - defined first so it can be used in openPlayerDrawer
  const handlePlayerChange = useCallback((newPlayerName) => {
    const playerId = getPlayerId(newPlayerName);
    if (playerId) {
      setSelectedPlayer(playerId, newPlayerName);
    }
  }, [getPlayerId, setSelectedPlayer]);

  // Open drawer with player data
  const openPlayerDrawer = useCallback((playerId, playerName) => {
    if (!playerId || !playerName) return;

    const stats = computePlayerStats(playerId);
    const matchHistory = computePlayerMatchHistory(playerId);

    openDrawer(DRAWER_TYPES.PLAYER_DETAILS, {
      playerName,
      playerStats: stats,
      playerMatchHistory: matchHistory,
      allPlayerNames,
      onPlayerChange: handlePlayerChange,
      leagueName,
      seasonName,
    });
  }, [computePlayerStats, computePlayerMatchHistory, allPlayerNames, leagueName, seasonName, openDrawer, handlePlayerChange]);

  // Handle player click - can take either (playerId, playerName) or just (playerName)
  const handlePlayerClick = useCallback((playerIdOrName, playerName = null) => {
    let playerId;
    let name;

    // Determine if first arg is playerId (number) or playerName (string)
    if (typeof playerIdOrName === 'number') {
      playerId = playerIdOrName;
      name = playerName || selectedPlayerName;
    } else {
      // First arg is playerName (string)
      name = playerIdOrName;
      playerId = getPlayerId(name);
    }

    if (!playerId || !name) return;

    setSelectedPlayer(playerId, name);
    openPlayerDrawer(playerId, name);
  }, [getPlayerId, setSelectedPlayer, openPlayerDrawer, selectedPlayerName]);

  // Auto-update drawer when player data changes while drawer is open
  useEffect(() => {
    if (isOpen && drawerType === DRAWER_TYPES.PLAYER_DETAILS && selectedPlayerName && selectedPlayerId) {
      // Only update if we have season data (for rankings) or precomputed data (for matches)
      if (seasonData || precomputedStats !== null) {
        openPlayerDrawer(selectedPlayerId, selectedPlayerName);
      }
    }
  }, [
    isOpen,
    drawerType,
    selectedPlayerName,
    selectedPlayerId,
    seasonData,
    precomputedStats,
    precomputedMatchHistory,
    allPlayerNames,
    leagueName,
    seasonName,
    openPlayerDrawer,
  ]);

  return {
    handlePlayerClick,
    handlePlayerChange,
  };
}




