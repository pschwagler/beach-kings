import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { getLeague, getLeagueSeasons, getLeagueMembers, getRankings, getSeasonMatches, getAllPlayerSeasonStats, getAllSeasonPartnershipOpponentStats } from '../services/api';
import { useAuth } from './AuthContext';

const LeagueContext = createContext(null);

export const LeagueProvider = ({ children, leagueId }) => {
  const { currentUserPlayer } = useAuth();
  const [league, setLeague] = useState(null);
  const [seasons, setSeasons] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
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

  // Compute isLeagueAdmin from members
  const isLeagueAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    const userMember = members.find(m => m.player_id === currentUserPlayer.id);
    return userMember?.role === 'admin';
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
        console.log('LeagueContext: membersData:', membersData);
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
      console.log('LeagueContext: membersData:', membersData);
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

  // Load season data with progressive loading
  const loadSeasonData = useCallback(async (seasonId) => {
    if (!seasonId) return;
    
    // Don't reload if already loading or loaded
    if (seasonDataLoading[seasonId] || seasonData[seasonId]) {
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
      const rankings = await getRankings({ season_id: seasonId });
      
      // Update with rankings first
      setSeasonData(prev => ({
        ...prev,
        [seasonId]: {
          rankings: rankings || [],
          matches: null,
          player_season_stats: null,
          partnership_opponent_stats: null
        }
      }));
      
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
      
      // Update with complete data
      setSeasonData(prev => ({
        ...prev,
        [seasonId]: {
          rankings: rankings || [],
          matches: matches || [],
          player_season_stats: playerStats || {},
          partnership_opponent_stats: partnershipOpponentStats || {}
        }
      }));
    } catch (err) {
      console.error('Error loading season data:', err);
      setSeasonDataError(prev => ({
        ...prev,
        [seasonId]: err.response?.data?.detail || 'Failed to load season data'
      }));
    } finally {
      setSeasonDataLoading(prev => {
        const newState = { ...prev };
        delete newState[seasonId];
        return newState;
      });
    }
  }, [seasonDataLoading, seasonData]);
  
  // Auto-load season data when active season changes
  useEffect(() => {
    if (activeSeason?.id) {
      loadSeasonData(activeSeason.id);
    }
  }, [activeSeason?.id, loadSeasonData]);
  
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
    
    // Get player season stats from context
    const seasonStats = activeSeasonData.player_season_stats?.[playerId];
    
    if (seasonStats) {
      // Get partnership and opponent stats from context
      const partnershipOpponentStats = activeSeasonData.partnership_opponent_stats?.[playerId] || { partnerships: [], opponents: [] };
      
      // Format stats array for PlayerStatsTable
      const statsArray = [];
      
      // Add overall row first
      statsArray.push({
        "Partner/Opponent": "OVERALL",
        "Points": seasonStats.points,
        "Games": seasonStats.games,
        "Wins": seasonStats.wins,
        "Losses": seasonStats.losses,
        "Win Rate": seasonStats.win_rate,
        "Avg Pt Diff": seasonStats.avg_point_diff
      });
      
      // Add empty row separator
      statsArray.push({ "Partner/Opponent": "" });
      
      // Add partnerships section
      if (partnershipOpponentStats.partnerships && partnershipOpponentStats.partnerships.length > 0) {
        statsArray.push({ "Partner/Opponent": "WITH PARTNERS" });
        statsArray.push(...partnershipOpponentStats.partnerships);
        statsArray.push({ "Partner/Opponent": "" }); // Empty row
      }
      
      // Add opponents section
      if (partnershipOpponentStats.opponents && partnershipOpponentStats.opponents.length > 0) {
        statsArray.push({ "Partner/Opponent": "VS OPPONENTS" });
        statsArray.push(...partnershipOpponentStats.opponents);
        statsArray.push({ "Partner/Opponent": "" }); // Empty row
      }
      
      // Format season stats for PlayerDetails component
      const formattedStats = {
        overview: {
          ranking: seasonStats.rank,
          points: seasonStats.points,
          rating: seasonStats.current_elo,
          games: seasonStats.games,
          wins: seasonStats.wins,
          losses: seasonStats.losses,
          win_rate: seasonStats.win_rate,
          avg_point_diff: seasonStats.avg_point_diff
        },
        stats: statsArray
      };
      setPlayerSeasonStats(formattedStats);
    } else {
      setPlayerSeasonStats(null);
    }
    
    // Filter match history to only include matches where this player participated
    const matches = activeSeasonData.matches || [];
    const playerMatches = matches.filter(match => {
      const playerIds = [
        match.team1_player1_id,
        match.team1_player2_id,
        match.team2_player1_id,
        match.team2_player2_id
      ].filter(Boolean);
      
      return playerIds.includes(playerId);
    });
    
    // Transform matches to MatchHistoryTable format
    const playerMatchHistory = playerMatches.map(match => {
      // Determine which team the player was on
      const isTeam1 = match.team1_player1_id === playerId || match.team1_player2_id === playerId;
      
      let partner, opponent1, opponent2, playerScore, opponentScore, result;
      
      if (isTeam1) {
        partner = match.team1_player1_id === playerId 
          ? match.team1_player2_name 
          : match.team1_player1_name;
        opponent1 = match.team2_player1_name;
        opponent2 = match.team2_player2_name;
        playerScore = match.team1_score;
        opponentScore = match.team2_score;
        result = match.winner === 1 ? 'W' : match.winner === 2 ? 'L' : 'T';
      } else {
        partner = match.team2_player1_id === playerId 
          ? match.team2_player2_name 
          : match.team2_player1_name;
        opponent1 = match.team1_player1_name;
        opponent2 = match.team1_player2_name;
        playerScore = match.team2_score;
        opponentScore = match.team1_score;
        result = match.winner === 2 ? 'W' : match.winner === 1 ? 'L' : 'T';
      }
      
      // Get ELO change for this player
      const eloChange = match.elo_changes?.[playerId];
      const eloAfter = eloChange?.elo_after;
      const eloChangeValue = eloChange?.elo_change;
      
      return {
        Date: match.date,
        Partner: partner || '',
        'Opponent 1': opponent1 || '',
        'Opponent 2': opponent2 || '',
        Result: result,
        Score: `${playerScore}-${opponentScore}`,
        'ELO After': eloAfter,
        'ELO Change': eloChangeValue,
        'Session Status': match.session_status || null
      };
    });
    
    setPlayerMatchHistory(playerMatchHistory);
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
  };
  console.log('LeagueContext: seasonData:', seasonData);

  return <LeagueContext.Provider value={value}>{children}</LeagueContext.Provider>;
};

export const useLeague = () => {
  const context = useContext(LeagueContext);
  if (!context) {
    throw new Error('useLeague must be used within a LeagueProvider');
  }
  return context;
};

