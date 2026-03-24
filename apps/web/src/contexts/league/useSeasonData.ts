'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  getRankings,
  getSeasonMatches,
  getMatchesWithElo,
  getAllPlayerSeasonStats,
  getAllSeasonPartnershipOpponentStats,
  getAllPlayerStats,
  getAllPartnershipOpponentStats,
} from '../../services/api';

export const ALL_SEASONS_KEY = 'all-seasons';

export interface RankingEntry {
  player_id?: number;
  Name?: string;
  [key: string]: unknown;
}

export interface SeasonDataEntry {
  rankings: RankingEntry[];
  matches: unknown[] | null;
  player_season_stats: Record<string, unknown> | null;
  partnership_opponent_stats: Record<string, unknown> | null;
}

/**
 * Manages season-level data loading: rankings, matches, player stats, and partnership stats.
 * Handles both specific seasons and the "All Seasons" aggregate view.
 *
 * @param {string|number} leagueId - The ID of the league.
 * @param {Array} seasons - List of season objects from useLeagueCore.
 * @returns {object} Season data state and callbacks.
 */
export function useSeasonData(leagueId: number, seasons: unknown[]) {
  const [seasonData, setSeasonData] = useState<Record<string | number, SeasonDataEntry>>({}); // Maps season_id to data
  const [seasonDataLoading, setSeasonDataLoading] = useState<Record<string | number, boolean>>({}); // Maps season_id to loading state

  // Selected season state (shared across tabs)
  // null = "All Seasons", number = specific season ID
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);

  // Refs mirror state for synchronous reads inside async callbacks.
  // Written at every mutation site — no sync effects needed.
  const loadingRef = useRef<Record<string | number, boolean>>({});
  const dataRef = useRef<Record<string | number, SeasonDataEntry>>({});

  // Compute selectedSeasonData once for all tabs to use
  // This ensures consistency across RankingsTab and MatchesTab
  const selectedSeasonData = useMemo(() => {
    if (!selectedSeasonId) {
      // "All Seasons" selected - use league stats data from ALL_SEASONS_KEY
      // loadAllSeasonsRankings already loads all matches via getMatchesWithElo
      const allSeasonsData = seasonData[ALL_SEASONS_KEY];
      if (allSeasonsData) {
        // Use matches directly from all-seasons data (already contains all matches)
        return allSeasonsData;
      }
      return null;
    }
    // Get data from seasonData map for specific season
    return seasonData[selectedSeasonId] || null;
  }, [selectedSeasonId, seasonData]);

  // Load season data with progressive loading
  const loadSeasonData = useCallback(async (seasonId, forceReload = false) => {
    if (!seasonId) return;

    // Check if already loading - even for force reload, prevent concurrent loads
    if (loadingRef.current[seasonId]) {
      return;
    }

    // Check if already loaded using refs (doesn't cause re-render)
    // Skip this check if forceReload is true
    if (!forceReload && dataRef.current[seasonId]) {
      return;
    }

    // Mark as loading immediately to prevent concurrent calls
    loadingRef.current[seasonId] = true;
    setSeasonDataLoading(prev => ({ ...prev, [seasonId]: true }));

    try {
      // Load rankings immediately (fast, show first)
      // Handle 404 gracefully - return empty array instead of failing
      let rankings = [];
      try {
        rankings = await getRankings({ season_id: seasonId }) || [];
      } catch (err) {
        // If 404 or empty, use empty array - don't fail the whole load
        if (err.response?.status === 404) {
          rankings = [];
        } else {
          throw err; // Re-throw other errors
        }
      }

      // Update with rankings first (skip check if force reloading)
      // Preserve existing matches during reload to avoid clearing them
      const rankingsData = {
        rankings: rankings || [],
        matches: dataRef.current[seasonId]?.matches || null,
        player_season_stats: dataRef.current[seasonId]?.player_season_stats || null,
        partnership_opponent_stats: dataRef.current[seasonId]?.partnership_opponent_stats || null,
      };
      dataRef.current[seasonId] = rankingsData;
      setSeasonData(prev => {
        if (!forceReload && prev[seasonId]) {
          return prev; // Already loaded
        }
        return { ...prev, [seasonId]: rankingsData };
      });

      // Load matches, player stats, and partnership/opponent stats in parallel (background)
      const [matches, playerStats, partnershipOpponentStats] = await Promise.all([
        getSeasonMatches(seasonId).catch(err => {
          console.error('Error loading season matches:', err);
          // Return empty array for 404 (season has no matches) instead of null
          // This allows the add matches card to show
          if (err.response?.status === 404) {
            return [];
          }
          return null;
        }),
        getAllPlayerSeasonStats(seasonId).catch(err => {
          console.error('Error loading player season stats:', err);
          return null;
        }),
        getAllSeasonPartnershipOpponentStats(seasonId).catch(err => {
          console.error('Error loading partnership/opponent stats:', err);
          return null;
        })
      ]);

      // Update with complete data (skip check if force reloading)
      // Update ref immediately so callers that await loadSeasonData can read data
      // without polling (e.g., refreshSeasonData).
      const completeData = {
        rankings: dataRef.current[seasonId]?.rankings || rankings || [],
        matches: matches || [],
        player_season_stats: playerStats || {},
        partnership_opponent_stats: partnershipOpponentStats || {},
      };
      dataRef.current[seasonId] = completeData;

      setSeasonData(prev => {
        const existing = prev[seasonId];
        if (!forceReload && existing?.matches && existing?.player_season_stats) {
          // Already has complete data, don't overwrite
          return prev;
        }
        return {
          ...prev,
          [seasonId]: completeData,
        };
      });
    } catch (err) {
      console.error('Error loading season data:', err);
      // Set empty data structure on error to prevent retries
      if (!dataRef.current[seasonId]) {
        const emptyData = {
          rankings: [],
          matches: [],
          player_season_stats: {},
          partnership_opponent_stats: {},
        };
        dataRef.current[seasonId] = emptyData;
        setSeasonData(prev => prev[seasonId] ? prev : { ...prev, [seasonId]: emptyData });
      }
    } finally {
      // Clear loading flag
      delete loadingRef.current[seasonId];
      setSeasonDataLoading(prev => {
        const newState = { ...prev };
        delete newState[seasonId];
        return newState;
      });
    }
  }, []); // Empty deps - function is stable, uses refs for state checks

  // Lightweight function to refresh only matches (not stats/rankings)
  const refreshMatchData = useCallback(async (seasonId, forceClear = false) => {
    if (!seasonId) return;

    try {
      // If forceClear is true, clear the cached data to force a fresh fetch
      if (forceClear && dataRef.current[seasonId]) {
        const { matches: _removed, ...rest } = dataRef.current[seasonId];
        dataRef.current[seasonId] = rest as SeasonDataEntry;
      }

      // Only fetch matches - much faster than full season data refresh
      const matches = await getSeasonMatches(seasonId).catch(err => {
        console.error('Error loading season matches:', err);
        // Return empty array for 404 (season has no matches or doesn't exist yet) instead of null
        // This allows the add matches card to show
        if (err.response?.status === 404) {
          return [];
        }
        return null;
      });

      if (matches === null) return;

      // Update only matches in seasonData, preserving other data
      setSeasonData(prev => {
        const existing = prev[seasonId];
        if (!existing) {
          // If season data doesn't exist yet, initialize it
          return {
            ...prev,
            [seasonId]: {
              rankings: [],
              matches: matches || [],
              player_season_stats: {},
              partnership_opponent_stats: {}
            }
          };
        }

        // Update only matches, preserve everything else
        return {
          ...prev,
          [seasonId]: {
            ...existing,
            matches: matches || []
          }
        };
      });

      // Update the ref immediately — cast needed because spread of empty fallback may lack required fields
      dataRef.current[seasonId] = {
        ...(dataRef.current[seasonId] || {}),
        matches: matches || []
      } as SeasonDataEntry;
    } catch (err) {
      console.error('Error refreshing match data:', err);
    }
  }, []);

  const refreshSeasonData = useCallback(async (seasonId) => {
    if (!seasonId) return;

    // Check if already loading to prevent duplicate refreshes
    if (loadingRef.current[seasonId]) {
      return;
    }

    // Clear the data ref so loadSeasonData will reload
    delete dataRef.current[seasonId];

    // Force reload — loadSeasonData updates dataRef synchronously after fetch,
    // so data is available in the ref as soon as the await resolves.
    await loadSeasonData(seasonId, true);

    // Note: Player data will be reloaded automatically when selectedSeasonData changes
  }, [loadSeasonData]);

  /**
   * Refresh only the matches portion of the "All Seasons" combined view.
   * Unlike loadAllSeasonsRankings, this skips the already-loaded guard
   * so it always fetches fresh match data.
   */
  const refreshAllSeasonsMatches = useCallback(async () => {
    if (!leagueId) return;

    try {
      const allMatches = await getMatchesWithElo({ league_id: leagueId }).catch(err => {
        console.error('Error refreshing all seasons matches:', err);
        return null;
      });
      if (allMatches === null) return;

      const sortedMatches = [...allMatches].sort((a, b) =>
        new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
      );

      setSeasonData(prev => {
        const existing = prev[ALL_SEASONS_KEY];
        if (!existing) return prev;
        return {
          ...prev,
          [ALL_SEASONS_KEY]: { ...existing, matches: sortedMatches }
        };
      });

      // Update the ref immediately
      if (dataRef.current[ALL_SEASONS_KEY]) {
        dataRef.current[ALL_SEASONS_KEY] = {
          ...dataRef.current[ALL_SEASONS_KEY],
          matches: sortedMatches
        };
      }
    } catch (err) {
      console.error('Error refreshing all seasons matches:', err);
    }
  }, [leagueId]);

  // Load rankings for all seasons in the league (when "All Seasons" is selected)
  const loadAllSeasonsRankings = useCallback(async () => {
    if (!leagueId) return;

    const allSeasonsKey = ALL_SEASONS_KEY;

    // Check if already loading
    if (loadingRef.current[allSeasonsKey]) {
      return;
    }

    // Check if already loaded using refs
    if (dataRef.current[allSeasonsKey]?.rankings !== undefined) {
      return;
    }

    // Mark as loading
    loadingRef.current[allSeasonsKey] = true;
    setSeasonDataLoading(prev => ({ ...prev, [allSeasonsKey]: true }));

    try {
      // Load rankings and stats for all seasons (using league stats)
      const [rankings, playerStats, partnershipOpponentStats] = await Promise.all([
        getRankings({ league_id: leagueId }).catch(err => {
          console.error('Error loading all seasons rankings:', err);
          return [];
        }),
        getAllPlayerStats({ league_id: leagueId }).catch(err => {
          console.error('Error loading all seasons player stats:', err);
          return null;
        }),
        getAllPartnershipOpponentStats({ league_id: leagueId }).catch(err => {
          console.error('Error loading all seasons partnership/opponent stats:', err);
          return null;
        })
      ]);

      // Load all league matches directly (consistent with league stats)
      const allMatches = await getMatchesWithElo({ league_id: leagueId }).catch(err => {
        console.error('Error loading all seasons matches:', err);
        // Fallback: combine matches from already loaded season data (use ref to avoid stale closure)
        const currentData = dataRef.current;
        const fallbackMatches = [];
        Object.keys(currentData).forEach(key => {
          if (key !== allSeasonsKey && currentData[key]?.matches) {
            fallbackMatches.push(...currentData[key].matches);
          }
        });
        return fallbackMatches;
      });

      // Sort matches by date descending (newest first)
      const sortedMatches = Array.isArray(allMatches) ? [...allMatches] : [];
      sortedMatches.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB.getTime() - dateA.getTime();
      });

      const allSeasonsResult = {
        rankings: rankings || [],
        matches: sortedMatches,
        player_season_stats: playerStats || {},
        partnership_opponent_stats: partnershipOpponentStats || {}
      };

      // Update seasonData with all-seasons data
      setSeasonData(prev => ({
        ...prev,
        [allSeasonsKey]: allSeasonsResult
      }));

      // Update ref
      dataRef.current[allSeasonsKey] = allSeasonsResult;
    } catch (err) {
      console.error('Error loading all seasons data:', err);

      // Combine matches from all seasons that are already loaded (use ref for current data)
      const currentData = dataRef.current;
      const allMatches = [];
      Object.keys(currentData).forEach(key => {
        if (key !== allSeasonsKey && currentData[key]?.matches) {
          allMatches.push(...currentData[key].matches);
        }
      });

      // Sort matches by date descending (newest first)
      allMatches.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB.getTime() - dateA.getTime();
      });

      const fallbackResult = {
        rankings: [],
        matches: allMatches,
        player_season_stats: {},
        partnership_opponent_stats: {}
      };

      setSeasonData(prev => ({
        ...prev,
        [allSeasonsKey]: fallbackResult
      }));

      // Update ref
      dataRef.current[allSeasonsKey] = fallbackResult;
    } finally {
      delete loadingRef.current[allSeasonsKey];
      setSeasonDataLoading(prev => {
        const newState = { ...prev };
        delete newState[allSeasonsKey];
        return newState;
      });
    }
  }, [leagueId]); // Stable deps only — uses refs for runtime data checks

  // Automatically load season data when selectedSeasonId changes
  // Uses refs for data checks to avoid re-running on every seasonData update
  useEffect(() => {
    if (selectedSeasonId) {
      // Load specific season if not already loaded (ref check avoids stale deps)
      if (!dataRef.current[selectedSeasonId]) {
        loadSeasonData(selectedSeasonId);
      }
    } else {
      // "All Seasons" selected - load rankings for all seasons in the league
      loadAllSeasonsRankings();
    }
  }, [selectedSeasonId, loadSeasonData, loadAllSeasonsRankings]);

  return {
    seasonData,
    seasonDataLoadingMap: seasonDataLoading,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeasonData,
    loadSeasonData,
    refreshSeasonData,
    refreshMatchData,
    refreshAllSeasonsMatches,
    loadAllSeasonsRankings,
  };
}
