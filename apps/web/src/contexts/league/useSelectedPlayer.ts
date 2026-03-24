'use client';

import { useState, useCallback, useEffect } from 'react';
import { transformPlayerData } from '../../components/league/utils/playerDataUtils';
import type { SeasonDataEntry } from './useSeasonData';

/**
 * Manages the selected player state and derives their stats from the current season data.
 * Stats are automatically recomputed whenever the selected season data changes.
 *
 * @param {object|null} selectedSeasonData - The active season data from useSeasonData.
 * @returns {object} Selected player state and the setSelectedPlayer callback.
 */
export function useSelectedPlayer(selectedSeasonData: SeasonDataEntry | null) {
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState<string | null>(null);
  const [playerSeasonStats, setPlayerSeasonStats] = useState<Record<string, unknown> | null>(null);
  const [playerMatchHistory, setPlayerMatchHistory] = useState<unknown[] | null>(null);

  // Helper to update player stats from active season data
  const updatePlayerStats = useCallback((seasonData, playerId) => {
    if (!seasonData || !playerId) {
      setPlayerSeasonStats(null);
      setPlayerMatchHistory(null);
      return;
    }

    // Transform player data using utility function
    const { stats, matchHistory } = transformPlayerData(seasonData, playerId);

    setPlayerSeasonStats(stats);
    setPlayerMatchHistory(matchHistory || []);
  }, []);

  // Load player data for the selected player (internal use only)
  const loadPlayerData = useCallback((playerId, playerName, seasonDataToUse = null) => {
    const dataToUse = seasonDataToUse || selectedSeasonData;
    if (!dataToUse) {
      setSelectedPlayerId(null);
      setSelectedPlayerName(null);
      setPlayerSeasonStats(null);
      setPlayerMatchHistory(null);
      return;
    }

    setSelectedPlayerId(playerId);
    setSelectedPlayerName(playerName);

    // Use helper to update stats
    updatePlayerStats(dataToUse, playerId);
  }, [selectedSeasonData, updatePlayerStats]);

  // Reload player data when selected season data changes
  useEffect(() => {
    if (selectedPlayerId && selectedSeasonData) {
      updatePlayerStats(selectedSeasonData, selectedPlayerId);
    }
  }, [selectedSeasonData, selectedPlayerId, updatePlayerStats]);

  const setSelectedPlayer = useCallback((playerId, playerName) => {
    setSelectedPlayerId(playerId);
    setSelectedPlayerName(playerName);
    if (playerId && playerName) {
      loadPlayerData(playerId, playerName);
    }
  }, [loadPlayerData]);

  return {
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    setSelectedPlayer,
  };
}
