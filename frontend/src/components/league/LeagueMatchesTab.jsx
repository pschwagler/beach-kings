import { useState, useEffect, useCallback, useMemo } from 'react';
import MatchesTable from '../match/MatchesTable';

import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerSelection } from './hooks/usePlayerSelection';
import { transformMatchData } from './utils/matchUtils';
import { 
  createMatch, 
  updateMatch, 
  deleteMatch, 
  getActiveSession,
  lockInLeagueSession,
  deleteSession,
  getPlayers
} from '../../services/api';
import { useDrawer, DRAWER_TYPES } from '../../contexts/DrawerContext';

export default function LeagueMatchesTab({ onPlayerClick }) {
  const { 
    league, 
    leagueId,
    seasons, 
    members, 
    activeSeason, 
    activeSeasonData, 
    refreshSeasonData,
    isLeagueAdmin,
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    setSelectedPlayer,
    showMessage
  } = useLeague();
  const { openDrawer } = useDrawer();
  const { currentUserPlayer } = useAuth();
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [allPlayerNames, setAllPlayerNames] = useState([]);
  const [playerNameToFullName, setPlayerNameToFullName] = useState(new Map());
  
  // Map player names (display names) to player IDs
  const [playerNameToId, setPlayerNameToId] = useState(new Map());

  // Get isLeagueMember from context
  const { isLeagueMember } = useLeague();

  // Track which sessions are in editing mode (local state only)
  const [editingSessions, setEditingSessions] = useState(new Set());
  
  // Track pending match changes when editing a session
  // Structure: { sessionId: { updates: Map<matchId, matchData>, additions: [matchData, ...], deletions: [] } }
  const [pendingMatchChanges, setPendingMatchChanges] = useState(new Map());
  
  // Store session metadata for sessions in edit mode (so we can show them even if all matches are deleted)
  // Structure: { sessionId: { id, name, status, createdAt, updatedAt, createdBy, updatedBy } }
  const [editingSessionMetadata, setEditingSessionMetadata] = useState(new Map());


  const loadLeagueMatches = useCallback(async () => {
    if (!leagueId || !league) return;
    
    // Don't load if activeSeasonData hasn't loaded yet (it will be null initially)
    if (activeSeasonData === null || activeSeasonData === undefined) {
      // Keep matches as null until we have season data
      return;
    }
    
    // Don't set matches if activeSeasonData.matches is undefined or null (not loaded yet)
    // Only proceed if matches is explicitly an array (even if empty)
    if (activeSeasonData.matches === undefined || activeSeasonData.matches === null) {
      // Keep matches as null until matches are loaded
      return;
    }
    
    setMatchesLoading(true);
    try {
      // Use matches from context - now includes all matches (submitted, edited, and active sessions)
      // Only use empty array if matches is explicitly an array (loaded but empty)
      const contextMatches = Array.isArray(activeSeasonData.matches) ? activeSeasonData.matches : [];
      const transformedMatches = transformMatchData(contextMatches);
      setMatches(transformedMatches);
    } catch (err) {
      console.error('Error loading league matches:', err);
      setMatches([]); // Empty array means loaded but no matches
    } finally {
      setMatchesLoading(false);
    }
  }, [leagueId, league, activeSeasonData]);

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
        
        // Create mapping from display name to player_id
        const nameToIdMapping = new Map();
        members.forEach(member => {
          const player = playerMap.get(member.player_id);
          if (!player) return;
          
          const fullName = player.full_name || `Player ${player.id}`;
          const displayName = player.nickname || fullName;
          
          // Map both display name and full name to player_id
          nameToIdMapping.set(displayName, member.player_id);
          if (player.nickname && player.nickname !== fullName) {
            nameToIdMapping.set(fullName, member.player_id);
          }
        });
        
        setAllPlayerNames(leaguePlayerNames);
        setPlayerNameToFullName(nameMapping);
        setPlayerNameToId(nameToIdMapping);
      } catch (err) {
        console.error('Error loading league players:', err);
        setAllPlayerNames([]);
        setPlayerNameToFullName(new Map());
      }
    };
    
    loadLeaguePlayers();
  }, [leagueId, members]);

  // Load matches and active session on mount and when dependencies change
  // Note: loadLeagueMatches depends on activeSeasonData, so we include it in deps
  useEffect(() => {
    if (leagueId && league && seasons.length > 0) {
      loadLeagueMatches();
      loadActiveSession();
    }
  }, [leagueId, league, seasons, activeSeasonData, loadLeagueMatches, loadActiveSession]);

  // Auto-select current user's player when player data is available (but don't open panel)
  // Falls back to first player if current user is not in the league
  usePlayerSelection({
    currentUserPlayer,
    selectedPlayerId,
    setSelectedPlayer,
    activeSeasonData,
    activeSeason,
    allPlayerNames,
    playerNameToId,
    members,
  });

  const handleRefreshSession = async () => {
    // Just refresh the session state without creating a new one
    await loadActiveSession();
    await loadLeagueMatches();
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);
      // Clear active session first
      await loadActiveSession();
      // Refresh season data in context to get updated matches and stats
      // The useEffect will automatically call loadLeagueMatches when activeSeasonData updates
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to submit scores');
      throw err;
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      // Refresh season data to get updated matches and stats
      // The useEffect will automatically call loadLeagueMatches when activeSeasonData updates
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
      await loadActiveSession();
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
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [], deletions: [] };
          sessionChanges.additions.push(matchDataWithFullNames);
          next.set(sessionId, sessionChanges);
          return next;
        });
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await createMatch(matchDataWithFullNames);
      // Reload active session first (may have been created by the first match)
      await loadActiveSession();
      // Refresh season data to get updated matches
      // The useEffect will automatically call loadLeagueMatches when activeSeasonData updates
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create game');
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
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [], deletions: [] };
          
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
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await updateMatch(matchId, matchDataWithFullNames);
      // Refresh season data to get updated matches
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update game');
      throw err;
    }
  };

  const handleDeleteMatch = async (matchId) => {
    try {
      // Check if this is a pending match (newly added match that hasn't been saved)
      if (typeof matchId === 'string' && matchId.startsWith('pending-')) {
        // Extract sessionId and index from temp ID: pending-{sessionId}-{index}
        const parts = matchId.split('-');
        if (parts.length >= 3) {
          const sessionId = parseInt(parts[1]);
          const index = parseInt(parts[2]);
          if (!isNaN(sessionId) && !isNaN(index) && index >= 0) {
            // Remove from pending additions
            setPendingMatchChanges(prev => {
              const next = new Map(prev);
              const sessionChanges = next.get(sessionId);
              if (sessionChanges && index < sessionChanges.additions.length) {
                // Remove the addition at this index
                sessionChanges.additions.splice(index, 1);
                next.set(sessionId, sessionChanges);
              }
              return next;
            });
            // Don't reload matches - UI will update from pendingMatchChanges state
            return;
          }
        }
        // Invalid pending ID format, just show success (match was never saved)
        return;
      }
      
      // Check if we're in edit mode for this match's session
      // Find the match to get its session ID
      const match = matches.find(m => m.id === matchId);
      const sessionId = match?.['Session ID'];
      
      if (sessionId && editingSessions.has(sessionId)) {
        // Track deletion in pending changes instead of deleting immediately
        setPendingMatchChanges(prev => {
          const next = new Map(prev);
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [], deletions: [] };
          
          // Remove from updates if it was being updated
          sessionChanges.updates.delete(matchId);
          
          // Add to deletions list
          if (!sessionChanges.deletions) {
            sessionChanges.deletions = [];
          }
          if (!sessionChanges.deletions.includes(matchId)) {
            sessionChanges.deletions.push(matchId);
          }
          
          next.set(sessionId, sessionChanges);
          return next;
        });
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      // Existing match not in edit mode - delete via API
      await deleteMatch(matchId);
      // Refresh season data to get updated matches
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete game');
      throw err;
    }
  };


  const handleEnterEditMode = (sessionId) => {
    setEditingSessions(prev => new Set(prev).add(sessionId));
    // Initialize pending changes for this session
    setPendingMatchChanges(prev => {
      const next = new Map(prev);
      if (!next.has(sessionId)) {
        next.set(sessionId, { updates: new Map(), additions: [], deletions: [] });
      }
      return next;
    });
    
    // Store session metadata so we can show the session even if all matches are deleted
    const sessionMatch = matches.find(m => m['Session ID'] === sessionId);
    if (sessionMatch) {
      setEditingSessionMetadata(prev => {
        const next = new Map(prev);
        next.set(sessionId, {
          id: sessionId,
          name: sessionMatch['Session Name'] || `Session ${sessionId}`,
          status: sessionMatch['Session Status'] || 'SUBMITTED',
          createdAt: sessionMatch['Session Created At'],
          updatedAt: sessionMatch['Session Updated At'],
          createdBy: sessionMatch['Session Created By'],
          updatedBy: sessionMatch['Session Updated By'],
        });
        return next;
      });
    }
  };

  const handleSaveEditedSession = async (sessionId) => {
    try {
      // Apply all pending match changes for this session
      const sessionChanges = pendingMatchChanges.get(sessionId);
      if (sessionChanges) {
        // Apply deletions first (before updates/additions)
        if (sessionChanges.deletions && sessionChanges.deletions.length > 0) {
          for (const matchId of sessionChanges.deletions) {
            await deleteMatch(matchId);
          }
        }
        
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
      setEditingSessionMetadata(prev => {
        const next = new Map(prev);
        next.delete(sessionId);
        return next;
      });
      
      // Clear active session first
      await loadActiveSession();
      // Refresh season data in context to get updated matches and stats
      // The useEffect will automatically call loadLeagueMatches when activeSeasonData updates
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
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

  // Handle player click from match cards
  const handlePlayerClick = (playerName) => {
    // Find player ID from name
    const playerId = playerNameToId.get(playerName);
    if (playerId) {
      setSelectedPlayer(playerId, playerName);
      openDrawer(DRAWER_TYPES.PLAYER_DETAILS, {
        playerName,
        playerStats: playerSeasonStats,
        playerMatchHistory,
        allPlayerNames,
        onPlayerChange: handlePlayerChange,
        leagueName: league?.name,
        seasonName: activeSeason?.name
      });
    } else {
      // If player not found, try to use the parent's onPlayerClick if provided
      if (onPlayerClick) {
        onPlayerClick(playerName);
      }
    }
  };



  const handlePlayerChange = (newPlayerName) => {
    // Find player ID from name
    const playerId = playerNameToId.get(newPlayerName);
    if (playerId) {
      setSelectedPlayer(playerId, newPlayerName);
    }
  };

  // Update drawer when player data changes while drawer is open
  const { isOpen, drawerType } = useDrawer();
  
  useEffect(() => {
    if (isOpen && drawerType === DRAWER_TYPES.PLAYER_DETAILS && selectedPlayerName) {
      openDrawer(DRAWER_TYPES.PLAYER_DETAILS, {
        playerName: selectedPlayerName,
        playerStats: playerSeasonStats,
        playerMatchHistory: playerMatchHistory,
        allPlayerNames,
        onPlayerChange: handlePlayerChange,
        leagueName: league?.name,
        seasonName: activeSeason?.name
      });
    }
  }, [
    selectedPlayerName, 
    playerSeasonStats, 
    playerMatchHistory, 
    isOpen, 
    drawerType, 
    allPlayerNames, 
    league?.name, 
    activeSeason?.name
  ]);

  return (
    <div className="league-section">
      <MatchesTable
        matches={matches}
        onPlayerClick={handlePlayerClick}
        loading={matchesLoading}
        activeSession={activeSession}
        onCreateSession={handleRefreshSession}
        onEndSession={handleEndSession}
        onDeleteSession={handleDeleteSession}
        onCreateMatch={handleCreateMatch}
        onUpdateMatch={handleUpdateMatch}
        onDeleteMatch={handleDeleteMatch}
        allPlayerNames={allPlayerNames}
        leagueId={leagueId}
        isAdmin={isLeagueAdmin}
        editingSessions={editingSessions}
        onEnterEditMode={handleEnterEditMode}
        onSaveEditedSession={handleSaveEditedSession}
        onCancelEdit={handleCancelEdit}
        pendingMatchChanges={pendingMatchChanges}
        editingSessionMetadata={editingSessionMetadata}
      />


    </div>
  );
}

