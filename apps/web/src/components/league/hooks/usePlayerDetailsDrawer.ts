import { useEffect, useCallback, useRef } from 'react';
import { useDrawer, DRAWER_TYPES } from '../../../contexts/DrawerContext';
import { transformPlayerData } from '../utils/playerDataUtils';
import { getFirstPlacePlayer } from '../../../utils/playerUtils';
import type { SeasonDataEntry, RankingEntry } from '../../../contexts/league/useSeasonData';
import type { Player, LeagueMember } from '../../../types';

/**
 * Custom hook to manage player details drawer logic.
 * Handles auto-selection, opening drawer, player changes, and auto-updating drawer when data changes.
 *
 * @param {Object} config - Configuration object
 * @param {Object} config.seasonData - Season data to use for stats (selectedSeasonData)
 * @param {Function} config.getPlayerStats - Function to get player stats: (playerId, seasonData) => stats object OR null if using pre-computed
 * @param {Function} config.getPlayerMatchHistory - Function to get match history: (playerId, seasonData) => match history array OR null if using pre-computed
 * @param {Array<{id: number, name: string}>} config.allPlayers - Player objects for the dropdown
 * @param {string} config.leagueName - League name to display
 * @param {string} config.seasonName - Season name to display
 * @param {number|null} config.selectedPlayerId - Currently selected player ID from context
 * @param {string|null} config.selectedPlayerName - Currently selected player name from context
 * @param {Function} config.setSelectedPlayer - Function to set selected player: (playerId, playerName) => void
 * @param {Object|null} config.precomputedStats - Pre-computed player stats (if not computing on-the-fly)
 * @param {Array|null} config.precomputedMatchHistory - Pre-computed match history (if not computing on-the-fly)
 * @param {boolean} config.autoSelect - Enable auto-selection of default player (default: false)
 * @param {Object|null} config.currentUserPlayer - Current user's player object (for auto-selection)
 * @param {Array|null} config.rankings - Rankings array (for rankings-based auto-selection)
 * @param {Array|null} config.members - League members array (for matches tab auto-selection)
 * @param {number|null} config.selectedSeasonId - Currently selected season ID (null = "All Seasons")
 *
 * @returns {Object} Object with handlePlayerClick function
 */
interface PlayerOption {
  id: number;
  name: string;
  is_placeholder?: boolean;
}

interface UsePlayerDetailsDrawerConfig {
  seasonData: SeasonDataEntry | null;
  getPlayerStats?: ((playerId: number, seasonData: SeasonDataEntry | null) => unknown) | null;
  getPlayerMatchHistory?: ((playerId: number, seasonData: SeasonDataEntry | null) => unknown[]) | null;
  allPlayers: PlayerOption[];
  leagueName: string;
  seasonName: string;
  selectedPlayerId: number | null;
  selectedPlayerName: string | null;
  setSelectedPlayer: (playerId: number, playerName: string) => void;
  precomputedStats?: unknown;
  precomputedMatchHistory?: unknown[] | null;
  autoSelect?: boolean;
  currentUserPlayer?: Player | null;
  rankings?: RankingEntry[] | null;
  members?: LeagueMember[] | null;
  selectedSeasonId?: number | null;
}

export function usePlayerDetailsDrawer({
  seasonData,
  getPlayerStats = null,
  getPlayerMatchHistory = null,
  allPlayers,
  leagueName,
  seasonName,
  selectedPlayerId,
  selectedPlayerName,
  setSelectedPlayer,
  precomputedStats = null,
  precomputedMatchHistory = null,
  autoSelect = false,
  currentUserPlayer = null,
  rankings = null,
  members = null,
  selectedSeasonId = null,
}: UsePlayerDetailsDrawerConfig) {
  const { openDrawer, isOpen, drawerType } = useDrawer();

  // Auto-select default player when data becomes available (if enabled)
  useEffect(() => {
    if (!autoSelect) return;

    // Don't auto-select if already selected
    if (selectedPlayerId) return;

    // Need season data to proceed
    if (!seasonData?.player_season_stats || !seasonData?.partnership_opponent_stats) return;

    // Case 1: Rankings-based selection (for RankingsTab)
    if (rankings && rankings.length > 0) {
      let playerToSelect = null;

      // Try to find current user's player in rankings first
      if (currentUserPlayer?.id) {
        const currentUserInRankings = rankings.find((r: RankingEntry) => r.player_id === currentUserPlayer.id);
        if (currentUserInRankings?.player_id) {
          playerToSelect = currentUserInRankings;
        }
      }

      // Fall back to first place player if current user not found
      if (!playerToSelect) {
        playerToSelect = (getFirstPlacePlayer(rankings as Parameters<typeof getFirstPlacePlayer>[0]) as RankingEntry | null) || rankings[0];
      }

      if (playerToSelect?.player_id) {
        setSelectedPlayer(playerToSelect.player_id, playerToSelect.name as string);
      }
      return;
    }

    // Case 2: allPlayers-based selection (for MatchesTab)
    if (allPlayers && allPlayers.length > 0) {
      let playerToSelect = null;

      // Try to find current user's player in the league
      if (currentUserPlayer?.id && members) {
        const userMember = members.find((m: LeagueMember) => m.player_id === currentUserPlayer.id);
        if (userMember) {
          const found = allPlayers.find((p: PlayerOption) => p.id === currentUserPlayer.id);
          if (found) {
            playerToSelect = found;
          }
        }
      }

      // Fall back to first player if current user not found
      if (!playerToSelect) {
        playerToSelect = allPlayers[0];
      }

      if (playerToSelect) {
        setSelectedPlayer(playerToSelect.id, playerToSelect.name);
      }
    }
  }, [
    autoSelect,
    selectedPlayerId,
    seasonData,
    rankings,
    allPlayers,
    currentUserPlayer,
    members,
    setSelectedPlayer,
  ]);

  // Helper to compute or get pre-computed player stats
  const computePlayerStats = useCallback((playerId: number) => {
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
  const computePlayerMatchHistory = useCallback((playerId: number) => {
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

  // Stable ref for handlePlayerClick to break circular dependency with openPlayerDrawer
  const handlePlayerClickRef = useRef<((playerIdOrName: number | string, playerName?: string | null) => void) | null>(null);

  // Refs for selected player so the auto-update effect doesn't fire on player changes
  // (handlePlayerClick already calls openPlayerDrawer directly)
  const selectedPlayerIdRef = useRef<number | null>(selectedPlayerId);
  const selectedPlayerNameRef = useRef<string | null>(selectedPlayerName);
  useEffect(() => {
    selectedPlayerIdRef.current = selectedPlayerId;
    selectedPlayerNameRef.current = selectedPlayerName;
  }, [selectedPlayerId, selectedPlayerName]);

  // Open drawer with player data
  const openPlayerDrawer = useCallback((playerId: number, playerName: string) => {
    if (!playerId || !playerName) return;

    const stats = computePlayerStats(playerId);
    const matchHistory = computePlayerMatchHistory(playerId);

    // If "All Seasons" is selected, don't show season name
    const displaySeasonName = selectedSeasonId === null ? null : seasonName;

    // Check if player is a placeholder (unregistered)
    const member = members?.find((m: LeagueMember) => m.player_id === playerId);
    const isPlaceholder = member?.is_placeholder ?? false;

    openDrawer(DRAWER_TYPES.PLAYER_DETAILS, {
      playerId,
      playerName,
      playerStats: stats,
      playerMatchHistory: matchHistory,
      allPlayerNames: allPlayers,
      onPlayerChange: (playerIdOrName: number | string, playerName?: string | null) => handlePlayerClickRef.current?.(playerIdOrName, playerName),
      leagueName,
      seasonName: displaySeasonName,
      isPlaceholder,
    });
  }, [computePlayerStats, computePlayerMatchHistory, allPlayers, leagueName, seasonName, openDrawer, selectedSeasonId, members]);

  // Handle player selection — sets state + opens/updates the drawer.
  // Accepts a player ID (number) or player name (string) for backwards compatibility.
  const handlePlayerClick = useCallback((playerIdOrName: number | string, playerName: string | null = null) => {
    let playerId: number | null;
    let name: string | null;

    if (typeof playerIdOrName === 'number') {
      playerId = playerIdOrName;
      name = playerName || allPlayers?.find((p: PlayerOption) => p.id === playerId)?.name || selectedPlayerName;
    } else {
      // String — look up by name
      name = playerIdOrName;
      const found = allPlayers?.find((p: PlayerOption) => p.name === name);
      playerId = found?.id || null;
    }

    if (!playerId || !name) return;

    setSelectedPlayer(playerId, name);
    openPlayerDrawer(playerId, name);
  }, [allPlayers, setSelectedPlayer, openPlayerDrawer, selectedPlayerName]);

  // Keep ref in sync
  useEffect(() => {
    handlePlayerClickRef.current = handlePlayerClick;
  }, [handlePlayerClick]);

  // Auto-update drawer when underlying data changes while drawer is open.
  // Uses refs for selectedPlayer to avoid double-render — handlePlayerClick
  // already calls openPlayerDrawer when the user switches players.
  useEffect(() => {
    const pid = selectedPlayerIdRef.current;
    const pname = selectedPlayerNameRef.current;
    if (isOpen && drawerType === DRAWER_TYPES.PLAYER_DETAILS && pname && pid) {
      if (seasonData || precomputedStats !== null) {
        openPlayerDrawer(pid, pname);
      }
    }
  }, [
    isOpen,
    drawerType,
    seasonData,
    precomputedStats,
    precomputedMatchHistory,
    allPlayers,
    leagueName,
    seasonName,
    openPlayerDrawer,
  ]);

  return { handlePlayerClick };
}
