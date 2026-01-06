import { useCallback } from 'react';

/**
 * Hook to consolidate all data refresh operations
 * Unifies loadActiveSession, loadAllSessions, refreshSeasonData, and refreshMatchData calls
 */
export function useDataRefresh({
  loadActiveSession,
  loadAllSessions,
  refreshSeasonData,
  refreshMatchData,
  getSeasonIdForRefresh,
  selectedSeasonId,
  seasons
}) {
  /**
   * Unified refresh function that handles all refresh operations
   * @param {Object} options - Refresh options
   * @param {boolean} options.sessions - Refresh active and all sessions (default: true)
   * @param {boolean} options.season - Refresh season data (stats/rankings) (default: false)
   * @param {boolean} options.matches - Refresh match data (default: true)
   * @param {number|null} options.seasonId - Specific season ID to refresh (default: uses getSeasonIdForRefresh)
   * @param {boolean} options.forceClear - Force clear cache before refresh (default: false)
   */
  const refreshData = useCallback(async (options = {}) => {
    const {
      sessions = true,
      season = false,
      matches = true,
      seasonId = null,
      forceClear = false
    } = options;

    const promises = [];

    // Refresh sessions
    if (sessions) {
      if (loadActiveSession) {
        promises.push(loadActiveSession());
      }
      if (loadAllSessions) {
        promises.push(loadAllSessions());
      }
    }

    // Refresh season data (stats/rankings)
    // Requires explicit seasonId when season option is true
    if (season && seasonId) {
      if (refreshSeasonData) {
        promises.push(refreshSeasonData(seasonId));
      }
    }

    // Refresh match data
    if (matches) {
      const idToRefresh = seasonId || (getSeasonIdForRefresh ? getSeasonIdForRefresh() : null);
      
      if (idToRefresh) {
        if (refreshMatchData) {
          promises.push(refreshMatchData(idToRefresh, forceClear));
        }
      } else if (!selectedSeasonId && seasons?.length > 0) {
        // "All Seasons" selected - refresh all seasons
        if (refreshMatchData) {
          const refreshPromises = seasons.map(s => refreshMatchData(s.id, forceClear));
          promises.push(...refreshPromises);
        }
      }
    }

    await Promise.all(promises);
  }, [
    loadActiveSession,
    loadAllSessions,
    refreshSeasonData,
    refreshMatchData,
    getSeasonIdForRefresh,
    selectedSeasonId,
    seasons
  ]);

  return { refreshData };
}


