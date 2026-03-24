import { useCallback } from 'react';
import { updateSessionSeason } from '../../../services/api';
import { useToast } from '../../../contexts/ToastContext';

/**
 * Hook to handle complex session season update logic
 * Manages data loading for old/new seasons and handles edge cases
 */
export function useSessionSeasonUpdate({
  activeSession,
  editingSessions,
  matches,
  refreshData,
  refreshSeasonData,
  setSelectedSeasonId,
  seasonData,
  seasonDataLoadingMap,
  loadSeasonData,
  seasons,
  selectedSeasonId,
  getSeasonIdForRefresh,
}) {
  const { showToast } = useToast();
  /**
   * Update a session's season ID
   * Handles data loading, refresh logic, and filter updates
   */
  const handleUpdateSessionSeason = useCallback(async (sessionId, seasonId) => {
    try {
      // Get the old season_id before updating (from active session or from matches)
      let oldSeasonId = null;
      const isActiveSession = activeSession && activeSession.id === sessionId;
      const isEditingSession = editingSessions?.has(sessionId);
      
      if (isActiveSession) {
        oldSeasonId = activeSession.season_id;
      } else {
        // Try to get it from the matches data
        const sessionMatch = matches?.find(m => m['Session ID'] === sessionId);
        if (sessionMatch) {
          oldSeasonId = sessionMatch['Session Season ID'];
        }
      }
      
      await updateSessionSeason(sessionId, seasonId);
      
      // Schedule delayed stats refresh for affected seasons after backend has time to recalculate
      // This allows the async stat calculation job to complete
      if (refreshSeasonData) {
        const seasonsToRefresh = new Set();
        
        // Add new season
        if (seasonId) {
          seasonsToRefresh.add(seasonId);
        }
        
        // Add old season if it exists and is different
        if (oldSeasonId && oldSeasonId !== seasonId) {
          seasonsToRefresh.add(oldSeasonId);
        }
        
        // Refresh all affected seasons
        Array.from(seasonsToRefresh).forEach(sid => {
          setTimeout(() => {
            try {
              refreshSeasonData(sid);
            } catch (error) {
              console.error('[useSessionSeasonUpdate.handleUpdateSessionSeason] Error refreshing stats:', error);
              // Don't throw - stats refresh failure shouldn't affect session operation
            }
          }, 2000);
        });
      }
      
      // If this is the active session and we're moving to a different season,
      // ensure the new season's data is loaded BEFORE reloading the active session
      // This prevents the active session from showing without matches
      if (isActiveSession && seasonId && seasonId !== oldSeasonId) {
        // Load the new season's data if not already loaded
        // This is critical: we need the data loaded before the active session state updates
        // so that activeSessionMatchesFromSeason can find the matches
        if (!seasonData?.[seasonId]?.matches && !seasonDataLoadingMap?.[seasonId]) {
          await loadSeasonData(seasonId);
          // Give React a chance to update state after loadSeasonData completes
          // The loadSeasonData function updates state asynchronously, so we need to wait
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Reload active session and all sessions to get updated season_id
      // This will trigger a re-render, and activeSessionMatchesFromSeason should now have data
      await refreshData({ sessions: true });
      
      // Refresh match data for both old and new seasons
      const seasonsToRefresh = new Set();
      
      // Add new season
      if (seasonId) {
        seasonsToRefresh.add(seasonId);
      }
      
      // Add old season if it exists and is different
      if (oldSeasonId && oldSeasonId !== seasonId) {
        seasonsToRefresh.add(oldSeasonId);
      }
      
      // Also refresh the currently selected season if it's different
      const currentSeasonId = getSeasonIdForRefresh?.();
      if (currentSeasonId) {
        seasonsToRefresh.add(currentSeasonId);
      }
      
      // Ensure the new season's data is loaded if it's not already loaded (for non-active sessions)
      if (seasonId && !isActiveSession && !seasonData?.[seasonId]?.matches && !seasonDataLoadingMap?.[seasonId]) {
        await loadSeasonData(seasonId);
      }
      
      // Refresh all affected seasons (force clear to ensure fresh data)
      await Promise.all(Array.from(seasonsToRefresh).map(sid => 
        refreshData({ matches: true, seasonId: sid, forceClear: true })
      ));
      
      // If "All Seasons" is selected, also refresh all seasons to ensure matches appear correctly
      if (!selectedSeasonId && seasons?.length > 0) {
        await Promise.all(seasons.map(s => 
          refreshData({ matches: true, seasonId: s.id, forceClear: true })
        ));
      }
      
      // If the session was moved to a different season than the currently selected filter,
      // switch to "All Seasons" so the user can see the updated session
      if (seasonId && selectedSeasonId && seasonId !== selectedSeasonId) {
        if (setSelectedSeasonId) {
          setSelectedSeasonId(null); // null means "All Seasons"
        }
      }
    } catch (err) {
      showToast(err.response?.data?.detail || 'Failed to update session season', 'error');
      throw err;
    }
  }, [
    activeSession,
    editingSessions,
    matches,
    refreshData,
    refreshSeasonData,
    setSelectedSeasonId,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    seasons,
    selectedSeasonId,
    getSeasonIdForRefresh,
    showToast
  ]);

  return {
    handleUpdateSessionSeason
  };
}

