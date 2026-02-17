'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLeague, getLeagueSeasons, getLeagueMembers, getRankings, getSeasonMatches, getMatchesWithElo, getAllPlayerSeasonStats, getAllSeasonPartnershipOpponentStats, getAllPlayerStats, getAllPartnershipOpponentStats } from '../services/api';
import { useAuth } from './AuthContext';
import { transformPlayerData } from '../components/league/utils/playerDataUtils';

const LeagueContext = createContext(null);

export const LeagueProvider = ({ children, leagueId }) => {
  const { currentUserPlayer, isInitializing: isAuthInitializing } = useAuth();
  const [league, setLeague] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Season data state
  const [seasonData, setSeasonData] = useState({}); // Maps season_id to data
  const [seasonDataLoading, setSeasonDataLoading] = useState({}); // Maps season_id to loading state
  
  // Selected season state (shared across tabs)
  // null = "All Seasons", number = specific season ID
  const [selectedSeasonId, setSelectedSeasonId] = useState(null);
  
  // Selected player state (persists across tabs)
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [playerSeasonStats, setPlayerSeasonStats] = useState(null);
  const [playerMatchHistory, setPlayerMatchHistory] = useState(null);
  
  // Helper function to check if a season is active based on dates
  const isSeasonActive = useCallback((season) => {
    if (!season || !season.start_date || !season.end_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    
    const startDate = new Date(season.start_date);
    startDate.setHours(0, 0, 0, 0);
    
    const endDate = new Date(season.end_date);
    endDate.setHours(0, 0, 0, 0);
    
    return today >= startDate && today <= endDate;
  }, []);

  // Helper function to check if a season is past
  const isSeasonPast = useCallback((season) => {
    if (!season || !season.end_date) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const endDate = new Date(season.end_date);
    endDate.setHours(0, 0, 0, 0);
    
    return today > endDate;
  }, []);

  // Find active seasons (date-based)
  const activeSeasons = useMemo(() => {
    if (!seasons) return [];
    return seasons.filter(isSeasonActive);
  }, [seasons, isSeasonActive]);

  // Find season with latest end_date for default selection
  const seasonWithLatestEndDate = useMemo(() => {
    if (!seasons || seasons.length === 0) return null;
    
    // Filter seasons that have end_date
    const seasonsWithEndDate = seasons.filter(s => s.end_date);
    
    if (seasonsWithEndDate.length > 0) {
      // Sort by end_date descending and take the first one
      return [...seasonsWithEndDate].sort((a, b) => {
        const dateA = new Date(a.end_date);
        const dateB = new Date(b.end_date);
        return dateB - dateA;
      })[0];
    }
    
    // Fall back to most recently created season if no end_date
    return [...seasons].sort((a, b) => {
      const dateA = new Date(a.created_at || 0);
      const dateB = new Date(b.created_at || 0);
      return dateB - dateA;
    })[0];
  }, [seasons]);

  // Use ref to track if we've initialized the season selection
  const hasInitializedSeasonRef = useRef(false);

  // Initialize selectedSeasonId to season with latest end_date when seasons first load
  // Only initialize once - don't reset if user has explicitly selected "All Seasons"
  useEffect(() => {
    if (!hasInitializedSeasonRef.current && selectedSeasonId === null && seasonWithLatestEndDate?.id) {
      setSelectedSeasonId(seasonWithLatestEndDate.id);
      hasInitializedSeasonRef.current = true;
    }
  }, [seasonWithLatestEndDate, selectedSeasonId]);

  // Compute isLeagueMember from members
  const isLeagueMember = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    // Handle both string and number IDs
    return members.some(m => 
      String(m.player_id) === String(currentUserPlayer.id) || 
      Number(m.player_id) === Number(currentUserPlayer.id)
    );
  }, [currentUserPlayer, members]);

  // Compute isLeagueAdmin from members
  const isLeagueAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    // Handle both string and number IDs
    const userMember = members.find(m => 
      String(m.player_id) === String(currentUserPlayer.id) || 
      Number(m.player_id) === Number(currentUserPlayer.id)
    );
    return userMember?.role?.toLowerCase() === 'admin';
  }, [currentUserPlayer, members]);
  
  // Compute selectedSeasonData once for all tabs to use
  // This ensures consistency across RankingsTab and MatchesTab
  const selectedSeasonData = useMemo(() => {
    if (!selectedSeasonId) {
      // "All Seasons" selected - use league stats data from 'all-seasons' key
      // loadAllSeasonsRankings already loads all matches via getMatchesWithElo
      const allSeasonsData = seasonData['all-seasons'];
      if (allSeasonsData) {
        // Use matches directly from all-seasons data (already contains all matches)
        return allSeasonsData;
      }
      return null;
    }
    // Get data from seasonData map for specific season
    return seasonData[selectedSeasonId] || null;
  }, [selectedSeasonId, seasonData]);

  const loadLeagueData = useCallback(async () => {
    if (!leagueId) {
      setLoading(false);
      return;
    }

    // Don't load if auth is still initializing
    if (isAuthInitializing) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const leagueData = await getLeague(leagueId);
      setLeague(leagueData);

      // Load seasons and members in parallel
      try {
        const [seasonsData, membersData] = await Promise.all([
          getLeagueSeasons(leagueId),
          getLeagueMembers(leagueId)
        ]);
        setSeasons(seasonsData);
        setMembers(membersData);
      } catch (err) {
        console.error('Error loading league data:', err);
        // Don't fail the whole load if seasons/members fail
      }
    } catch (err) {
      console.error('Error loading league:', err);
      setError(err.response?.data?.detail || 'Failed to load league');
    } finally {
      setLoading(false);
    }
  }, [leagueId, isAuthInitializing]);

  useEffect(() => {
    // Wait for auth to finish initializing before loading league data
    // This prevents race conditions where API calls are made before tokens are set
    if (!isAuthInitializing) {
      loadLeagueData();
    }
  }, [loadLeagueData, isAuthInitializing]);

  // refreshLeague is just an alias for loadLeagueData - kept for backward compatibility
  const refreshLeague = useCallback(() => {
    return loadLeagueData();
  }, [loadLeagueData]);

  const refreshSeasons = useCallback(async () => {
    if (!leagueId) return;
    try {
      const seasonsData = await getLeagueSeasons(leagueId);
      setSeasons(seasonsData);
    } catch (err) {
      console.error('Error refreshing seasons:', err);
    }
  }, [leagueId]);

  const refreshMembers = useCallback(async () => {
    if (!leagueId) return;
    try {
      const membersData = await getLeagueMembers(leagueId);
      setMembers(membersData);
    } catch (err) {
      console.error('Error refreshing members:', err);
    }
  }, [leagueId]);

  const updateLeague = useCallback((updatedLeague) => {
    setLeague(updatedLeague);
  }, []);

  const updateMember = useCallback((memberId, updates) => {
    setMembers(prev => prev.map(m => 
      m.id === memberId ? { ...m, ...updates } : m
    ));
  }, []);

  // Use refs to track loading state without causing re-renders
  const loadingRef = useRef({});
  const dataRef = useRef({});
  
  // Update refs when state changes
  useEffect(() => {
    loadingRef.current = seasonDataLoading;
  }, [seasonDataLoading]);
  
  useEffect(() => {
    dataRef.current = seasonData;
  }, [seasonData]);
  
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
      setSeasonData(prev => {
        if (!forceReload && prev[seasonId]) {
          return prev; // Already loaded
        }
        const existing = prev[seasonId];
        return {
          ...prev,
          [seasonId]: {
            rankings: rankings || [],
            matches: existing?.matches || null, // Preserve existing matches during reload
            player_season_stats: existing?.player_season_stats || null,
            partnership_opponent_stats: existing?.partnership_opponent_stats || null
          }
        };
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
      setSeasonData(prev => {
        const existing = prev[seasonId];
        if (!forceReload && existing?.matches && existing?.player_season_stats) {
          // Already has complete data, don't overwrite
          return prev;
        }
        return {
          ...prev,
          [seasonId]: {
            rankings: existing?.rankings || rankings || [],
            matches: matches || [],
            player_season_stats: playerStats || {},
            partnership_opponent_stats: partnershipOpponentStats || {}
          }
        };
      });
    } catch (err) {
      console.error('Error loading season data:', err);
      // Set empty data structure on error to prevent retries
      setSeasonData(prev => {
        if (prev[seasonId]) {
          return prev; // Don't overwrite if data exists
        }
        return {
          ...prev,
          [seasonId]: {
            rankings: [],
            matches: [],
            player_season_stats: {},
            partnership_opponent_stats: {}
          }
        };
      });
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
        delete dataRef.current[seasonId].matches;
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
      
      // Update the ref immediately
      dataRef.current[seasonId] = {
        ...(dataRef.current[seasonId] || {}),
        matches: matches || []
      };
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
    // But keep loadingRef to prevent concurrent calls
    delete dataRef.current[seasonId];
    
    // Force reload the data (this will update seasonData in place)
    await loadSeasonData(seasonId, true);
    
    // Wait for the data to actually be available in state
    // Check up to 15 times with 150ms intervals (2.25 seconds total max wait)
    let dataLoaded = false;
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 150));
      const currentData = dataRef.current[seasonId];
      if (currentData?.matches !== undefined && currentData?.matches !== null) {
        dataLoaded = true;
        break;
      }
    }
    
    // If data loaded, wait one more cycle to ensure React has re-rendered
    if (dataLoaded) {
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    
    // Note: Player data will be reloaded automatically when selectedSeasonData changes
  }, [loadSeasonData]);

  // Load rankings for all seasons in the league (when "All Seasons" is selected)
  const loadAllSeasonsRankings = useCallback(async () => {
    if (!leagueId) return;
    
    const allSeasonsKey = 'all-seasons';
    
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
        // Fallback: combine matches from already loaded season data
        const fallbackMatches = [];
        Object.keys(seasonData).forEach(key => {
          if (key !== allSeasonsKey && seasonData[key]?.matches) {
            fallbackMatches.push(...seasonData[key].matches);
          }
        });
        return fallbackMatches;
      });
      
      // Sort matches by date descending (newest first)
      const sortedMatches = Array.isArray(allMatches) ? [...allMatches] : [];
      sortedMatches.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
      });
      
      // Update seasonData with all-seasons data
      setSeasonData(prev => ({
        ...prev,
        [allSeasonsKey]: {
          rankings: rankings || [],
          matches: sortedMatches,
          player_season_stats: playerStats || {},
          partnership_opponent_stats: partnershipOpponentStats || {}
        }
      }));
      
      // Update ref
      dataRef.current[allSeasonsKey] = {
        rankings: rankings || [],
        matches: sortedMatches,
        player_season_stats: playerStats || {},
        partnership_opponent_stats: partnershipOpponentStats || {}
      };
    } catch (err) {
      console.error('Error loading all seasons data:', err);
      
      // Combine matches from all seasons that are already loaded
      const allMatches = [];
      Object.keys(seasonData).forEach(key => {
        if (key !== allSeasonsKey && seasonData[key]?.matches) {
          allMatches.push(...seasonData[key].matches);
        }
      });
      
      // Sort matches by date descending (newest first)
      allMatches.sort((a, b) => {
        const dateA = new Date(a.date || 0);
        const dateB = new Date(b.date || 0);
        return dateB - dateA;
      });
      
      setSeasonData(prev => ({
        ...prev,
        [allSeasonsKey]: {
          rankings: [],
          matches: allMatches,
          player_season_stats: {},
          partnership_opponent_stats: {}
        }
      }));
      
      // Update ref
      dataRef.current[allSeasonsKey] = {
        rankings: [],
        matches: allMatches,
        player_season_stats: {},
        partnership_opponent_stats: {}
      };
    } finally {
      delete loadingRef.current[allSeasonsKey];
      setSeasonDataLoading(prev => {
        const newState = { ...prev };
        delete newState[allSeasonsKey];
        return newState;
      });
    }
  }, [leagueId]);

  // Automatically load season data when selectedSeasonId changes
  // This centralizes the logic that was duplicated in LeagueRankingsTab and LeagueMatchesTab
  useEffect(() => {
    if (selectedSeasonId) {
      // Load specific season if not already loaded
      if (!seasonData[selectedSeasonId]) {
        loadSeasonData(selectedSeasonId);
      }
    } else {
      // "All Seasons" selected - load rankings for all seasons in the league
      loadAllSeasonsRankings();
    }
  }, [selectedSeasonId, seasonData, loadSeasonData, loadAllSeasonsRankings]);

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

  const value = {
    league,
    seasons,
    members,
    loading,
    error,
    refreshLeague,
    refreshSeasons,
    refreshMembers,
    updateLeague,
    updateMember,
    activeSeasons,
    isSeasonActive,
    isSeasonPast,
    selectedSeasonData,
    seasonData,
    seasonDataLoadingMap: seasonDataLoading,
    loadSeasonData,
    refreshSeasonData,
    refreshMatchData,
    loadAllSeasonsRankings,
    isLeagueMember,
    isLeagueAdmin,
    // Selected season state
    selectedSeasonId,
    setSelectedSeasonId,
    // Selected player state
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    setSelectedPlayer: (playerId, playerName) => {
      setSelectedPlayerId(playerId);
      setSelectedPlayerName(playerName);
      if (playerId && playerName) {
        loadPlayerData(playerId, playerName);
      }
    },
    // League ID
    leagueId,
  };

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
};

export const useLeague = () => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};
