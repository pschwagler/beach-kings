import { useState, useEffect, useCallback, useMemo } from 'react';
import MatchesTable from '../match/MatchesTable';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { 
  queryMatches, 
  createMatch, 
  updateMatch, 
  deleteMatch, 
  getActiveSession,
  lockInLeagueSession,
  deleteSession,
  getPlayers
} from '../../services/api';

export default function LeagueMatchesTab({ leagueId, onPlayerClick, showMessage }) {
  const { league, seasons, members } = useLeague();
  const { currentUserPlayer } = useAuth();
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [allPlayerNames, setAllPlayerNames] = useState([]);
  const [playerNameToFullName, setPlayerNameToFullName] = useState(new Map());

  // Compute isLeagueMember from context
  const isLeagueMember = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    return members.some(m => m.player_id === currentUserPlayer.id);
  }, [currentUserPlayer, members]);

  // Compute isAdmin from context
  const isAdmin = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    const userMember = members.find(m => m.player_id === currentUserPlayer.id);
    return userMember?.role === 'admin';
  }, [currentUserPlayer, members]);

  // Track which sessions are in editing mode (local state only)
  const [editingSessions, setEditingSessions] = useState(new Set());
  
  // Track pending match changes when editing a session
  // Structure: { sessionId: { updates: Map<matchId, matchData>, additions: [matchData, ...] } }
  const [pendingMatchChanges, setPendingMatchChanges] = useState(new Map());

  // Transform match data from API format to MatchesTable format
  const transformMatchData = (matches) => {
    return matches.map(match => {
      const winner = match.winner === 1 ? 'Team 1' : match.winner === 2 ? 'Team 2' : 'Tie';
      return {
        id: match.id,
        Date: match.date,
        'Session ID': match.session_id,
        'Session Name': match.session_name || match.date,
        'Session Status': match.session_status || null,
        'Session Created At': match.session_created_at || null,
        'Session Updated At': match.session_updated_at || null,
        'Session Created By': match.session_created_by_name || null,
        'Session Updated By': match.session_updated_by_name || null,
        'Team 1 Player 1': match.team1_player1_name || '',
        'Team 1 Player 2': match.team1_player2_name || '',
        'Team 2 Player 1': match.team2_player1_name || '',
        'Team 2 Player 2': match.team2_player2_name || '',
        'Team 1 Score': match.team1_score,
        'Team 2 Score': match.team2_score,
        Winner: winner,
        'Team 1 ELO Change': match.team1_elo_change || 0,
        'Team 2 ELO Change': match.team2_elo_change || 0,
      };
    });
  };

  const loadLeagueMatches = useCallback(async () => {
    if (!leagueId || !league) return;
    setMatchesLoading(true);
    try {
      // Find the active season for this league
      const activeSeason = seasons.find(s => s.is_active === true || s.is_active === 1);
      
      // Filter matches by the league's active season
      const queryParams = {
        submitted_only: false,
        include_non_public: isLeagueMember,
        limit: 1000,
        sort_by: 'date',
        sort_dir: 'desc'
      };
      
      // Use season_id if we have an active season, otherwise fall back to league_id
      if (activeSeason) {
        queryParams.season_id = activeSeason.id;
      } else {
        queryParams.league_id = leagueId;
      }
      
      const response = await queryMatches(queryParams);
      // queryMatches returns an array directly, not wrapped in an object
      const matches = Array.isArray(response) ? response : (response.matches || []);
      const transformedMatches = transformMatchData(matches);
      setMatches(transformedMatches);
    } catch (err) {
      console.error('Error loading league matches:', err);
      setMatches([]);
    } finally {
      setMatchesLoading(false);
    }
  }, [leagueId, league, seasons, isLeagueMember]);

  const loadActiveSession = useCallback(async () => {
    if (!leagueId) return;
    try {
      const session = await getActiveSession().catch(() => null);
      // TODO: Filter by league_id when API supports it
      setActiveSession(session);
    } catch (err) {
      console.error('Error loading active session:', err);
      setActiveSession(null);
    }
  }, [leagueId]);

  // Load league player names for match creation (nickname if exists, else full_name)
  useEffect(() => {
    if (!leagueId) {
      setAllPlayerNames([]);
      setPlayerNameToFullName(new Map());
      return;
    }
    
    // If no members yet, wait for them to load
    if (!members.length) {
      return;
    }
    
    const loadLeaguePlayers = async () => {
      try {
        // Get all players to access their full data (including nicknames)
        const allPlayersData = await getPlayers();
        
        // Create a map of player_id to player data for quick lookup
        const playerMap = new Map();
        allPlayersData.forEach(p => {
          playerMap.set(p.id, p);
        });
        
        // Create mapping from display name to full_name
        const nameMapping = new Map();
        const playerNameSet = new Set();
        
        // Get display names for league members (nickname if exists, else full_name)
        members.forEach(member => {
          const player = playerMap.get(member.player_id);
          if (!player) return;
          
          const fullName = player.full_name || `Player ${player.id}`;
          // Use nickname if exists, otherwise use full_name
          const displayName = player.nickname || fullName;
          
          // Map display name to full_name (for match submission)
          nameMapping.set(displayName, fullName);
          // Add display name to the set
          playerNameSet.add(displayName);
          
          // If player has a nickname, also add full_name to dropdown options
          // (so editing works when form shows full_name)
          if (player.nickname && player.nickname !== fullName) {
            nameMapping.set(fullName, fullName);
            playerNameSet.add(fullName);
          }
        });
        
        const leaguePlayerNames = Array.from(playerNameSet).sort((a, b) => a.localeCompare(b));
        
        setAllPlayerNames(leaguePlayerNames);
        setPlayerNameToFullName(nameMapping);
      } catch (err) {
        console.error('Error loading league players:', err);
        setAllPlayerNames([]);
        setPlayerNameToFullName(new Map());
      }
    };
    
    loadLeaguePlayers();
  }, [leagueId, members]);

  // Load matches and active session on mount and when dependencies change
  useEffect(() => {
    if (leagueId && league && seasons.length > 0) {
      loadLeagueMatches();
      loadActiveSession();
    }
  }, [leagueId, league, seasons, loadLeagueMatches, loadActiveSession]);

  const handleRefreshSession = async () => {
    // Just refresh the session state without creating a new one
    await loadActiveSession();
    await loadLeagueMatches();
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);
      showMessage?.('success', 'Scores submitted and stats recalculated!');
      await loadActiveSession();
      await loadLeagueMatches();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to submit scores');
      throw err;
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      showMessage?.('success', 'Session deleted successfully');
      await loadActiveSession();
      await loadLeagueMatches();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete session');
      throw err;
    }
  };

  const handleCreateMatch = async (matchData, sessionId = null) => {
    try {
      // Convert display names (nicknames) back to full_name for backend
      const matchDataWithFullNames = {
        ...matchData,
        team1_player1: playerNameToFullName.get(matchData.team1_player1) || matchData.team1_player1,
        team1_player2: playerNameToFullName.get(matchData.team1_player2) || matchData.team1_player2,
        team2_player1: playerNameToFullName.get(matchData.team2_player1) || matchData.team2_player1,
        team2_player2: playerNameToFullName.get(matchData.team2_player2) || matchData.team2_player2,
      };
      
      // If we're editing a session, store the change locally instead of making API call
      if (sessionId && editingSessions.has(sessionId)) {
        setPendingMatchChanges(prev => {
          const next = new Map(prev);
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [] };
          sessionChanges.additions.push(matchDataWithFullNames);
          next.set(sessionId, sessionChanges);
          return next;
        });
        showMessage?.('success', 'Match added (pending save)');
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await createMatch(matchDataWithFullNames);
      showMessage?.('success', 'Match created successfully');
      await loadLeagueMatches();
      await loadActiveSession();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create match');
      throw err;
    }
  };

  const handleUpdateMatch = async (matchId, matchData, sessionId = null) => {
    try {
      // Convert display names (nicknames) back to full_name for backend
      const matchDataWithFullNames = {
        ...matchData,
        team1_player1: playerNameToFullName.get(matchData.team1_player1) || matchData.team1_player1,
        team1_player2: playerNameToFullName.get(matchData.team1_player2) || matchData.team1_player2,
        team2_player1: playerNameToFullName.get(matchData.team2_player1) || matchData.team2_player1,
        team2_player2: playerNameToFullName.get(matchData.team2_player2) || matchData.team2_player2,
      };
      
      // If we're editing a session, store the change locally instead of making API call
      if (sessionId && editingSessions.has(sessionId)) {
        setPendingMatchChanges(prev => {
          const next = new Map(prev);
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [] };
          
          // Check if this is a pending match (newly added match being edited)
          if (typeof matchId === 'string' && matchId.startsWith('pending-')) {
            // Extract index from temp ID: pending-{sessionId}-{index}
            const parts = matchId.split('-');
            if (parts.length >= 3) {
              const index = parseInt(parts[2]);
              if (!isNaN(index) && index >= 0 && index < sessionChanges.additions.length) {
                // Update the addition in place
                sessionChanges.additions[index] = matchDataWithFullNames;
              } else {
                // Index not found, add as new addition
                sessionChanges.additions.push(matchDataWithFullNames);
              }
            } else {
              // Invalid temp ID format, add as new addition
              sessionChanges.additions.push(matchDataWithFullNames);
            }
          } else {
            // Existing match being edited - store in updates
            sessionChanges.updates.set(matchId, matchDataWithFullNames);
          }
          
          next.set(sessionId, sessionChanges);
          return next;
        });
        showMessage?.('success', 'Match updated (pending save)');
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await updateMatch(matchId, matchDataWithFullNames);
      showMessage?.('success', 'Match updated successfully');
      await loadLeagueMatches();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update match');
      throw err;
    }
  };

  const handleDeleteMatch = async (matchId) => {
    try {
      await deleteMatch(matchId);
      showMessage?.('success', 'Match deleted successfully');
      await loadLeagueMatches();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete match');
      throw err;
    }
  };

  const handleCreatePlayer = async (name) => {
    try {
      // This will be handled by AddMatchModal
      const players = await getPlayers();
      const player = players.find(p => (p.full_name || p.nickname || '').toLowerCase() === name.toLowerCase());
      if (!player) {
        throw new Error('Player creation not yet implemented for league context');
      }
      return player;
    } catch (err) {
      console.error('Error creating player:', err);
      throw err;
    }
  };

  const handleEnterEditMode = (sessionId) => {
    setEditingSessions(prev => new Set(prev).add(sessionId));
    // Initialize pending changes for this session
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      if (!next.has(sessionId)) {
        next.set(sessionId, { updates: new Map(), additions: [] });
      }
      return next;
    });
  };

  const handleSaveEditedSession = async (sessionId) => {
    try {
      // Apply all pending match changes for this session
      const sessionChanges = pendingMatchChanges.get(sessionId);
      if (sessionChanges) {
        // Apply updates
        for (const [matchId, matchData] of sessionChanges.updates) {
          await updateMatch(matchId, matchData);
        }
        
        // Apply additions
        for (const matchData of sessionChanges.additions) {
          await createMatch(matchData);
        }
      }
      
      // Lock in the session (this will recalculate stats)
      await lockInLeagueSession(leagueId, sessionId);
      showMessage?.('success', 'Session saved and stats recalculated!');
      
      // Clear editing state and pending changes
      setEditingSessions(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
      setPendingMatchChanges(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      
      await loadLeagueMatches();
      await loadActiveSession();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to save session');
      throw err;
    }
  };

  const handleCancelEdit = (sessionId) => {
    setEditingSessions(prev => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
    // Discard pending changes for this session
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      next.delete(sessionId);
      return next;
    });
    // Reload matches to discard any local changes
    loadLeagueMatches();
  };

  return (
    <div className="league-section">
      <MatchesTable
        matches={matches}
        onPlayerClick={onPlayerClick}
        loading={matchesLoading}
        activeSession={activeSession}
        onCreateSession={handleRefreshSession}
        onEndSession={handleEndSession}
        onDeleteSession={handleDeleteSession}
        onCreateMatch={handleCreateMatch}
        onUpdateMatch={handleUpdateMatch}
        onDeleteMatch={handleDeleteMatch}
        onCreatePlayer={handleCreatePlayer}
        allPlayerNames={allPlayerNames}
        isLeagueMember={isLeagueMember}
        leagueId={leagueId}
        isAdmin={isAdmin}
        editingSessions={editingSessions}
        onEnterEditMode={handleEnterEditMode}
        onSaveEditedSession={handleSaveEditedSession}
        onCancelEdit={handleCancelEdit}
        pendingMatchChanges={pendingMatchChanges}
      />
    </div>
  );
}

