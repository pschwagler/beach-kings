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
  refreshAllSeasonsMatches,
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
  const refreshData = useCallback(async (options: {
    sessions?: boolean;
    season?: boolean;
    matches?: boolean;
    seasonId?: number | null;
    forceClear?: boolean;
  } = {}) => {
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
      }

      // When "All Seasons" is selected, also refresh the combined view
      if (!selectedSeasonId && refreshAllSeasonsMatches) {
        promises.push(refreshAllSeasonsMatches());
      }
    }

    await Promise.all(promises);
  }, [
    loadActiveSession,
    loadAllSessions,
    refreshSeasonData,
    refreshMatchData,
    refreshAllSeasonsMatches,
    getSeasonIdForRefresh,
    selectedSeasonId,
    seasons
  ]);

  return { refreshData };
}
