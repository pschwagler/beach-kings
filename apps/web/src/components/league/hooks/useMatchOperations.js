import { useCallback } from 'react';
import { createMatch, updateMatch, deleteMatch } from '../../../services/api';

/**
 * Hook for pure match API operations
 * Handles data transformation and API calls only - no edit mode logic
 */
export function useMatchOperations({
  playerNameToId,
  refreshMatchData,
  getSeasonIdForRefresh,
  loadActiveSession,
  loadAllSessions
}) {
  /**
   * Normalize match data by converting player names/objects to IDs
   * @param {Object} matchData - Match data with player names or IDs
   * @returns {Object} Match data with player IDs
   */
  const normalizeMatchData = useCallback((matchData) => {
    const getPlayerId = (playerValue) => {
      // If it's already an ID (number), return it
      if (typeof playerValue === 'number') {
        return playerValue;
      }
      // If it's an object with value (from player dropdown), use the value
      if (typeof playerValue === 'object' && playerValue !== null && 'value' in playerValue) {
        return playerValue.value;
      }
      // If it's a string (player name), convert to ID
      if (typeof playerValue === 'string') {
        return playerNameToId?.get(playerValue) || null;
      }
      return null;
    };

    return {
      ...matchData,
      team1_player1_id: getPlayerId(matchData.team1_player1_id || matchData.team1_player1),
      team1_player2_id: getPlayerId(matchData.team1_player2_id || matchData.team1_player2),
      team2_player1_id: getPlayerId(matchData.team2_player1_id || matchData.team2_player1),
      team2_player2_id: getPlayerId(matchData.team2_player2_id || matchData.team2_player2),
      team1_score: matchData.team1_score,
      team2_score: matchData.team2_score,
      is_public: matchData.is_public,
      is_ranked: matchData.is_ranked
    };
  }, [playerNameToId]);

  /**
   * Create a match via API
   * @param {Object} matchData - Match data (may contain player names or IDs)
   */
  const createMatchAPI = useCallback(async (matchData) => {
    // Match data should already contain player IDs from AddMatchModal
    // But normalize just in case
    const normalized = normalizeMatchData(matchData);
    
    await createMatch(normalized);
    
    // Reload active session and all sessions (may have been created by the first match)
    if (loadActiveSession) {
      await loadActiveSession();
    }
    if (loadAllSessions) {
      await loadAllSessions();
    }
    
    // Refresh match data
    if (refreshMatchData && getSeasonIdForRefresh) {
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
      }
    }
  }, [normalizeMatchData, loadActiveSession, loadAllSessions, refreshMatchData, getSeasonIdForRefresh]);

  /**
   * Update a match via API
   * @param {number|string} matchId - Match ID to update
   * @param {Object} matchData - Match data (may contain player names or IDs)
   */
  const updateMatchAPI = useCallback(async (matchId, matchData) => {
    const normalized = normalizeMatchData(matchData);
    
    // Validate all player IDs are provided
    if (!normalized.team1_player1_id || !normalized.team1_player2_id || 
        !normalized.team2_player1_id || !normalized.team2_player2_id) {
      throw new Error('All four players must be selected');
    }
    
    await updateMatch(matchId, normalized);
    
    // Refresh match data
    if (refreshMatchData && getSeasonIdForRefresh) {
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
      }
    }
  }, [normalizeMatchData, refreshMatchData, getSeasonIdForRefresh]);

  /**
   * Delete a match via API
   * @param {number|string} matchId - Match ID to delete
   */
  const deleteMatchAPI = useCallback(async (matchId) => {
    await deleteMatch(matchId);
    
    // Refresh match data
    if (refreshMatchData && getSeasonIdForRefresh) {
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
      }
    }
  }, [refreshMatchData, getSeasonIdForRefresh]);

  return {
    normalizeMatchData,
    createMatchAPI,
    updateMatchAPI,
    deleteMatchAPI
  };
}
