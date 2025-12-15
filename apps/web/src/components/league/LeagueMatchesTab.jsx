import { useState, useEffect, useCallback, useMemo } from 'react';
import MatchesTable from '../match/MatchesTable';

import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerDetailsDrawer } from './hooks/usePlayerDetailsDrawer';
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

export default function LeagueMatchesTab() {
  const { 
    league, 
    leagueId,
    seasons, 
    members, 
    activeSeason, 
    activeSeasonData, 
    seasonDataLoading,
    refreshSeasonData,
    refreshMatchData,
    isLeagueAdmin,
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    setSelectedPlayer,
    showMessage
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [allPlayerNames, setAllPlayerNames] = useState([]);
  const [playerNameToFullName, setPlayerNameToFullName] = useState(new Map());
  const [playerNameToId, setPlayerNameToId] = useState(new Map());
  const [editingSessions, setEditingSessions] = useState(new Set());
  
  // Track pending match changes when editing a session
  // Structure: { sessionId: { updates: Map<matchId, matchData>, additions: [matchData, ...], deletions: [] } }
  const [pendingMatchChanges, setPendingMatchChanges] = useState(new Map());
  
  // Store session metadata for sessions in edit mode (so we can show them even if all matches are deleted)
  // Structure: { sessionId: { id, name, status, createdAt, updatedAt, createdBy, updatedBy } }
  const [editingSessionMetadata, setEditingSessionMetadata] = useState(new Map());


  // Transform matches from context for display
  const matches = useMemo(() => {
    if (!activeSeasonData?.matches) return null;
    return transformMatchData(activeSeasonData.matches);
  }, [activeSeasonData?.matches]);

  const loadActiveSession = useCallback(async () => {
    if (!leagueId) return null;
    try {
      const session = await getActiveSession().catch(() => null);
      // TODO: Filter by league_id when API supports it
      setActiveSession(session);
      return session;
    } catch (err) {
      console.error('Error loading active session:', err);
      setActiveSession(null);
      return null;
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

  // Load active session on mount and when dependencies change
  useEffect(() => {
    if (leagueId && league && seasons.length > 0) {
      loadActiveSession();
    }
  }, [leagueId, league, seasons, loadActiveSession]);

  // Polling: Check for new matches every 5 seconds if there's an active session
  // Uses refreshMatchData to update context - component will automatically update via activeSeasonData
  useEffect(() => {
    if (!activeSession || !activeSeason?.id) {
      return;
    }

    const pollForNewMatches = async () => {
      try {
        // Refresh match data in context - component will automatically update via activeSeasonData
        await refreshMatchData(activeSeason.id);
      } catch (err) {
        console.error('Error polling for new matches:', err);
      }
    };
    const pollInterval = setInterval(pollForNewMatches, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [activeSession, activeSeason?.id, refreshMatchData]);

  const handleRefreshSession = async () => {
    // Just refresh the session state without creating a new one
    await loadActiveSession();
    // Refresh match data in context
    if (activeSeason?.id) {
      await refreshMatchData(activeSeason.id);
    }
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);
      // Clear active session first
      await loadActiveSession();
      // Refresh season data in context for stats/rankings (other components may need this)
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
      // Reload matches directly - force refresh to get latest data
      if (activeSeason?.id) {
        await refreshMatchData(activeSeason.id);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to submit scores');
      throw err;
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      // Refresh season data in context for stats/rankings (other components may need this)
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
      await loadActiveSession();
      // Reload matches directly - force refresh to get latest data
      if (activeSeason?.id) {
        await refreshMatchData(activeSeason.id);
      }
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
      
      // Reload active session (may have been created by the first match)
      await loadActiveSession();
      
      // Reload matches directly - force refresh to get latest data
      if (activeSeason?.id) {
        await refreshMatchData(activeSeason.id);
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
      // Reload matches directly - force refresh to get latest data
      if (activeSeason?.id) {
        await refreshMatchData(activeSeason.id);
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
      // Reload matches directly - force refresh to get latest data
      if (activeSeason?.id) {
        await refreshMatchData(activeSeason.id);
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
      // Refresh season data in context for stats/rankings (other components may need this)
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
      // Reload matches directly - force refresh to get latest data
      if (activeSeason?.id) {
        await refreshMatchData(activeSeason.id);
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
    // Reload matches to discard any local changes - force refresh to get latest from API
    if (activeSeason?.id) {
      refreshMatchData(activeSeason.id);
    }
  };

  // Helper to get player ID from name using playerNameToId map
  const getPlayerIdFromMap = useCallback((playerName) => {
    return playerNameToId.get(playerName) || null;
  }, [playerNameToId]);

  // Use shared hook for player details drawer logic with auto-selection
  const { handlePlayerClick, handlePlayerChange } = usePlayerDetailsDrawer({
    seasonData: activeSeasonData,
    getPlayerId: getPlayerIdFromMap,
    allPlayerNames,
    leagueName: league?.name,
    seasonName: activeSeason?.name,
    selectedPlayerId,
    selectedPlayerName,
    setSelectedPlayer,
    precomputedStats: playerSeasonStats,
    precomputedMatchHistory: playerMatchHistory,
    autoSelect: true,
    currentUserPlayer,
    activeSeason,
    members,
  });

  return (
    <div className="league-section">
      <MatchesTable
        matches={matches}
        onPlayerClick={handlePlayerClick}
        loading={seasonDataLoading}
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

