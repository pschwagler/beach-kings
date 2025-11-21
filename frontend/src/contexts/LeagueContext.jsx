import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { getLeague, getLeagueSeasons, getLeagueMembers, getRankings, getSeasonMatches, getAllPlayerSeasonStats, getAllSeasonPartnershipOpponentStats } from '../services/api';
import { useAuth } from './AuthContext';
import { transformPlayerData } from '../components/league/utils/playerDataUtils';

const LeagueContext = createContext(null);

export const LeagueProvider = ({ children, leagueId }) => {
  const { currentUserPlayer } = useAuth();
  const [league, setLeague] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  
  // Season data state
  const [seasonData, setSeasonData] = useState({}); // Maps season_id to data
  const [seasonDataLoading, setSeasonDataLoading] = useState({}); // Maps season_id to loading state
  const [seasonDataError, setSeasonDataError] = useState({}); // Maps season_id to error
  
  // Selected player state (persists across tabs)
  const [selectedPlayerId, setSelectedPlayerId] = useState(null);
  const [selectedPlayerName, setSelectedPlayerName] = useState(null);
  const [playerSeasonStats, setPlayerSeasonStats] = useState(null);
  const [playerMatchHistory, setPlayerMatchHistory] = useState(null);
  const [isPlayerPanelOpen, setIsPlayerPanelOpen] = useState(false);
  
  // Find active season
  const activeSeason = useMemo(() => {
    return seasons?.find(s => s.is_active === true) || null;
  }, [seasons]);

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
  
  // Get active season data
  const activeSeasonData = useMemo(() => {
    if (!activeSeason) return null;
    return seasonData[activeSeason.id] || null;
  }, [activeSeason, seasonData]);

  const loadLeagueData = useCallback(async () => {
    if (!leagueId) {
      setLoading(false);
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
  }, [leagueId]);

  useEffect(() => {
    loadLeagueData();
  }, [loadLeagueData]);

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
  const loadSeasonData = useCallback(async (seasonId) => {
    if (!seasonId) return;
    
    // Check if already loading or loaded using refs (doesn't cause re-render)
    if (loadingRef.current[seasonId] || dataRef.current[seasonId]) {
      return;
    }
    
    setSeasonDataLoading(prev => ({ ...prev, [seasonId]: true }));
    setSeasonDataError(prev => {
      const newState = { ...prev };
      delete newState[seasonId];
      return newState;
    });
    
    try {
      // Load rankings immediately (fast, show first)
      // Handle 404 gracefully - return empty array instead of failing
      let rankings = [];
      try {
        rankings = await getRankings({ season_id: seasonId }) || [];
      } catch (err) {
        // If 404 or empty, use empty array - don't fail the whole load
        if (err.response?.status === 404) {
          console.log('No rankings found for season', seasonId, '- using empty array');
          rankings = [];
        } else {
          throw err; // Re-throw other errors
        }
      }
      
      // Update with rankings first (check again to avoid race conditions)
      setSeasonData(prev => {
        if (prev[seasonId]) {
          return prev; // Already loaded
        }
        return {
          ...prev,
          [seasonId]: {
            rankings: rankings || [],
            matches: null,
            player_season_stats: null,
            partnership_opponent_stats: null
          }
        };
      });
      
      // Load matches, player stats, and partnership/opponent stats in parallel (background)
      const [matches, playerStats, partnershipOpponentStats] = await Promise.all([
        getSeasonMatches(seasonId).catch(err => {
          console.error('Error loading season matches:', err);
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
      
      // Update with complete data (check again to avoid race conditions)
      setSeasonData(prev => {
        const existing = prev[seasonId];
        if (existing?.matches && existing?.player_season_stats) {
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
      setSeasonDataError(prev => ({
        ...prev,
        [seasonId]: err.response?.data?.detail || 'Failed to load season data'
      }));
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
      setSeasonDataLoading(prev => {
        const newState = { ...prev };
        delete newState[seasonId];
        return newState;
      });
    }
  }, []); // Empty deps - function is stable, uses refs for state checks
  
  // Auto-load season data when active season changes
  useEffect(() => {
    if (activeSeason?.id) {
      // Check using refs to avoid infinite loop
      const seasonId = activeSeason.id;
      if (!loadingRef.current[seasonId] && !dataRef.current[seasonId]) {
        loadSeasonData(seasonId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeason?.id]); // Only depend on activeSeason.id - loadSeasonData is stable
  
  const refreshSeasonData = useCallback(async (seasonId) => {
    // Clear existing data and reload
    setSeasonData(prev => {
      const newState = { ...prev };
      delete newState[seasonId];
      return newState;
    });
    await loadSeasonData(seasonId);
    // Note: Player data will be reloaded automatically by the useEffect that watches activeSeasonData
  }, [loadSeasonData]);

  // Load player data for the selected player
  const loadPlayerData = useCallback((playerId, playerName) => {
    if (!activeSeasonData || !activeSeason) {
      setSelectedPlayerId(null);
      setSelectedPlayerName(null);
      setPlayerSeasonStats(null);
      setPlayerMatchHistory(null);
      return;
    }
    
    setSelectedPlayerId(playerId);
    setSelectedPlayerName(playerName);
    
    // Transform player data using utility function
    const { stats, matchHistory } = transformPlayerData(activeSeasonData, playerId);
    
    setPlayerSeasonStats(stats);
    setPlayerMatchHistory(matchHistory || []);
  }, [activeSeasonData, activeSeason]);

  // Reload player data when season data changes
  useEffect(() => {
    if (selectedPlayerId && selectedPlayerName && activeSeasonData) {
      loadPlayerData(selectedPlayerId, selectedPlayerName);
    }
  }, [activeSeasonData, selectedPlayerId, selectedPlayerName, loadPlayerData]);

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
    activeSeason,
    activeSeasonData,
    seasonDataLoading: activeSeason ? seasonDataLoading[activeSeason.id] : false,
    seasonDataError: activeSeason ? seasonDataError[activeSeason.id] : null,
    loadSeasonData,
    refreshSeasonData,
    isLeagueMember,
    isLeagueAdmin,
    // Selected player state
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    isPlayerPanelOpen,
    setIsPlayerPanelOpen,
    loadPlayerData,
    setSelectedPlayer: (playerId, playerName) => {
      setSelectedPlayerId(playerId);
      setSelectedPlayerName(playerName);
      if (playerId && playerName) {
        loadPlayerData(playerId, playerName);
      }
    },
    clearSelectedPlayer: () => {
      setSelectedPlayerId(null);
      setSelectedPlayerName(null);
      setPlayerSeasonStats(null);
      setPlayerMatchHistory(null);
      setIsPlayerPanelOpen(false);
    },
    // League ID and message utilities
    leagueId,
    showMessage: (type, text) => {
      setMessage({ type, text });
      setTimeout(() => setMessage(null), 5000);
    },
    message,
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

