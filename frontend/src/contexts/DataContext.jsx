import { createContext, useContext, useState, useEffect } from 'react';
import { getRankings, getMatches, loadFromSheets, getSessions, getActiveSession, createSession, lockInSession, deleteSession, createMatch, updateMatch, deleteMatch, getPlayers, createPlayer } from '../services/api';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};

export const DataProvider = ({ children }) => {
  const [rankings, setRankings] = useState([]);
  const [matches, setMatches] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [allPlayerNames, setAllPlayerNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  // Load both rankings and matches on mount
  useEffect(() => {
    loadAllData();
  }, []);

  const loadPlayers = async () => {
    try {
      const playersData = await getPlayers().catch(() => []);
      const playerNames = playersData.map(p => p.name).sort((a, b) => a.localeCompare(b));
      setAllPlayerNames(playerNames);
    } catch (error) {
      console.error('Error loading players:', error);
    }
  };

  const loadAllData = async () => {
    try {
      setLoading(true);
      const [rankingsData, matchesData, sessionsData, activeSessionData, playersData] = await Promise.all([
        getRankings().catch(() => []),
        getMatches().catch(() => []),
        getSessions().catch(() => []),
        getActiveSession().catch(() => null),
        getPlayers().catch(() => [])
      ]);
      
      setRankings(rankingsData);
      setMatches(matchesData);
      setSessions(sessionsData);
      setActiveSession(activeSessionData);
      
      // Set player names from database
      const playerNames = playersData.map(p => p.name).sort((a, b) => a.localeCompare(b));
      setAllPlayerNames(playerNames);
      
      if (rankingsData.length === 0 && matchesData.length === 0) {
        setMessage({
          type: 'error',
          text: 'No data found. Click "Refresh from Google Sheets" to load data.'
        });
      } else {
        setMessage(null);
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: `Error loading data: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  const loadRankings = async () => {
    try {
      setLoading(true);
      const data = await getRankings();
      setRankings(data);
      setMessage(null);
    } catch (error) {
      if (error.response?.status === 404) {
        setMessage({
          type: 'error',
          text: 'Rankings not found. Click "Refresh from Google Sheets" to load data.'
        });
        setRankings([]);
      } else {
        setMessage({
          type: 'error',
          text: `Error loading rankings: ${error.message}`
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const loadMatches = async () => {
    try {
      setLoading(true);
      const data = await getMatches();
      setMatches(data);
      setMessage(null);
    } catch (error) {
      if (error.response?.status === 404) {
        setMessage({
          type: 'error',
          text: 'Matches not found. Click "Refresh from Google Sheets" to load data.'
        });
        setMatches([]);
      } else {
        setMessage({
          type: 'error',
          text: `Error loading matches: ${error.message}`
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFromSheets = async () => {
    try {
      setMessage({ type: 'loading', text: 'Loading data from Google Sheets...' });
      const result = await loadFromSheets();
      setMessage({
        type: 'success',
        text: `✓ Success! Loaded ${result.player_count} players and ${result.match_count} matches from Google Sheets.`
      });
      
      // Auto-refresh data after loading
      setTimeout(() => {
        loadAllData();
      }, 1500);
    } catch (error) {
      setMessage({
        type: 'error',
        text: `❌ Error: ${error.response?.data?.detail || error.message}`
      });
    }
  };

  const handleCreatePlayer = async (name) => {
    try {
      await createPlayer(name);
      // Reload player names to include the new player
      await loadPlayers();
    } catch (error) {
      console.error('Error creating player:', error);
      throw error;
    }
  };

  const handleCreateSession = async () => {
    try {
      const result = await createSession();
      
      // Reload sessions and set as active
      const sessionsData = await getSessions();
      setSessions(sessionsData);
      setActiveSession(result.session);
      
      return result.session;
    } catch (error) {
      const errorMessage = error.response?.data?.detail || error.message;
      
      // Check if it's a duplicate session error (400 status)
      if (error.response?.status === 400) {
        setMessage({
          type: 'error',
          text: `❌ ${errorMessage}`
        });
      } else {
        setMessage({
          type: 'error',
          text: `❌ Error creating session: ${errorMessage}`
        });
      }
      throw error;
    }
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInSession(sessionId);
      setMessage({
        type: 'success',
        text: '✓ Scores submitted and stats recalculated!'
      });
      
      // Reload all data to reflect the recalculated stats
      const sessionsData = await getSessions();
      setSessions(sessionsData);
      setActiveSession(null);
      await loadAllData();
    } catch (error) {
      setMessage({
        type: 'error',
        text: `❌ Error submitting scores: ${error.response?.data?.detail || error.message}`
      });
      throw error;
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      setMessage({
        type: 'success',
        text: '✓ Session deleted successfully!'
      });
      
      // Reload sessions and clear active session
      const sessionsData = await getSessions();
      setSessions(sessionsData);
      setActiveSession(null);
      await loadMatches();
    } catch (error) {
      setMessage({
        type: 'error',
        text: `❌ Error deleting session: ${error.response?.data?.detail || error.message}`
      });
      throw error;
    }
  };

  const handleCreateMatch = async (matchData) => {
    try {
      const result = await createMatch(matchData);
      setMessage({
        type: 'success',
        text: '✓ Match added successfully!'
      });
      
      // Reload matches and players to show the new match and any new players
      await Promise.all([loadMatches(), loadPlayers()]);
      
      return result;
    } catch (error) {
      setMessage({
        type: 'error',
        text: `❌ Error creating match: ${error.response?.data?.detail || error.message}`
      });
      throw error;
    }
  };

  const handleUpdateMatch = async (matchId, matchData) => {
    try {
      const result = await updateMatch(matchId, matchData);
      setMessage({
        type: 'success',
        text: '✓ Match updated successfully!'
      });
      
      // Reload matches and players to show the updated match and any new players
      await Promise.all([loadMatches(), loadPlayers()]);
      
      return result;
    } catch (error) {
      setMessage({
        type: 'error',
        text: `❌ Error updating match: ${error.response?.data?.detail || error.message}`
      });
      throw error;
    }
  };

  const handleDeleteMatch = async (matchId) => {
    try {
      const result = await deleteMatch(matchId);
      setMessage({
        type: 'success',
        text: '✓ Match deleted successfully!'
      });
      
      // Reload matches to remove the deleted match
      await loadMatches();
      
      return result;
    } catch (error) {
      setMessage({
        type: 'error',
        text: `❌ Error deleting match: ${error.response?.data?.detail || error.message}`
      });
      throw error;
    }
  };

  const value = {
    rankings,
    matches,
    sessions,
    activeSession,
    loading,
    message,
    setMessage,
    loadRankings,
    loadMatches,
    loadPlayers,
    loadAllData,
    handleLoadFromSheets,
    handleCreateSession,
    handleEndSession,
    handleDeleteSession,
    handleCreateMatch,
    handleUpdateMatch,
    handleDeleteMatch,
    handleCreatePlayer,
    allPlayerNames
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

