import { useState, useEffect, useCallback, useMemo } from 'react';
import MatchesTable from '../match/MatchesTable';
import PlayerDetailsPanel from '../player/PlayerDetailsPanel';
import { useLeague } from '../../contexts/LeagueContext';
import { useAuth } from '../../contexts/AuthContext';
import { 
  createMatch, 
  updateMatch, 
  deleteMatch, 
  getActiveSession,
  lockInLeagueSession,
  deleteSession,
  getPlayers
} from '../../services/api';

export default function LeagueMatchesTab({ leagueId, onPlayerClick, showMessage }) {
  const { 
    league, 
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
    isPlayerPanelOpen,
    setIsPlayerPanelOpen,
    setSelectedPlayer
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  const [matches, setMatches] = useState([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [activeSession, setActiveSession] = useState(null);
  const [allPlayerNames, setAllPlayerNames] = useState([]);
  const [playerNameToFullName, setPlayerNameToFullName] = useState(new Map());
  
  // Map player names (display names) to player IDs
  const [playerNameToId, setPlayerNameToId] = useState(new Map());

  // Compute isLeagueMember from context
  const isLeagueMember = useMemo(() => {
    if (!currentUserPlayer || !members.length) return false;
    return members.some(m => m.player_id === currentUserPlayer.id);
  }, [currentUserPlayer, members]);

  // Track which sessions are in editing mode (local state only)
  const [editingSessions, setEditingSessions] = useState(new Set());
  
  // Track pending match changes when editing a session
  // Structure: { sessionId: { updates: Map<matchId, matchData>, additions: [matchData, ...], deletions: [] } }
  const [pendingMatchChanges, setPendingMatchChanges] = useState(new Map());
  
  // Store session metadata for sessions in edit mode (so we can show them even if all matches are deleted)
  // Structure: { sessionId: { id, name, status, createdAt, updatedAt, createdBy, updatedBy } }
  const [editingSessionMetadata, setEditingSessionMetadata] = useState(new Map());

  // Transform match data from API format to MatchesTable format
  const transformMatchData = (matches) => {
    return matches.map(match => {
      const winner = match.winner === 1 ? 'Team 1' : match.winner === 2 ? 'Team 2' : 'Tie';
      
      // Handle both context format (with elo_changes) and API format (with team elo changes)
      let team1EloChange = 0;
      let team2EloChange = 0;
      
      if (match.elo_changes) {
        // Context format: calculate team ELO changes from individual player changes
        const team1Players = [match.team1_player1_id, match.team1_player2_id].filter(Boolean);
        const team2Players = [match.team2_player1_id, match.team2_player2_id].filter(Boolean);
        
        team1Players.forEach(playerId => {
          if (match.elo_changes[playerId]) {
            team1EloChange += match.elo_changes[playerId].elo_change || 0;
          }
        });
        
        team2Players.forEach(playerId => {
          if (match.elo_changes[playerId]) {
            team2EloChange += match.elo_changes[playerId].elo_change || 0;
          }
        });
      } else {
        // API format: use team ELO changes directly
        team1EloChange = match.team1_elo_change || 0;
        team2EloChange = match.team2_elo_change || 0;
      }
      
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
        'Team 1 ELO Change': team1EloChange,
        'Team 2 ELO Change': team2EloChange,
      };
    });
  };

  const loadLeagueMatches = useCallback(async () => {
    if (!leagueId || !league) return;
    setMatchesLoading(true);
    try {
      // Use matches from context - now includes all matches (submitted, edited, and active sessions)
      const contextMatches = activeSeasonData?.matches || [];
      const transformedMatches = transformMatchData(contextMatches);
      setMatches(transformedMatches);
    } catch (err) {
      console.error('Error loading league matches:', err);
      setMatches([]);
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
  useEffect(() => {
    if (leagueId && league && seasons.length > 0) {
      loadLeagueMatches();
      loadActiveSession();
    }
  }, [leagueId, league, seasons, loadLeagueMatches, loadActiveSession]);

  // Auto-select current user's player when player data is available (but don't open panel)
  // Falls back to first player if current user is not in the league
  useEffect(() => {
    if (!selectedPlayerId && allPlayerNames.length > 0 && playerNameToId.size > 0 && activeSeasonData?.player_season_stats && activeSeasonData?.partnership_opponent_stats && activeSeason) {
      let playerToSelect = null;
      let playerNameToSelect = null;
      
      // Try to find current user's player in the league
      if (currentUserPlayer && currentUserPlayer.id) {
        // Check if current user is a member
        const userMember = members.find(m => m.player_id === currentUserPlayer.id);
        if (userMember) {
          // Find the display name for this player
          const playerName = allPlayerNames.find(name => {
            const id = playerNameToId.get(name);
            return id === currentUserPlayer.id;
          });
          
          if (playerName) {
            playerToSelect = currentUserPlayer.id;
            playerNameToSelect = playerName;
          }
        }
      }
      
      // Fall back to first player if current user not found
      if (!playerToSelect && allPlayerNames.length > 0) {
        const firstName = allPlayerNames[0];
        const firstId = playerNameToId.get(firstName);
        if (firstId) {
          playerToSelect = firstId;
          playerNameToSelect = firstName;
        }
      }
      
      if (playerToSelect && playerNameToSelect) {
        setSelectedPlayer(playerToSelect, playerNameToSelect);
        // Don't auto-open the panel - let user click to open it
      }
    }
  }, [allPlayerNames, playerNameToId, members, currentUserPlayer, selectedPlayerId, activeSeasonData, activeSeason, setSelectedPlayer]);

  const handleRefreshSession = async () => {
    // Just refresh the session state without creating a new one
    await loadActiveSession();
    await loadLeagueMatches();
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);
      // Refresh season data in context to get updated matches and stats
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
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
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [], deletions: [] };
          sessionChanges.additions.push(matchDataWithFullNames);
          next.set(sessionId, sessionChanges);
          return next;
        });
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await createMatch(matchDataWithFullNames);
      // Refresh season data to get updated matches
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
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
      await loadLeagueMatches();
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update match');
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
      
      // Refresh season data in context to get updated matches and stats
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
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

  // Handle player click from match cards
  const handlePlayerClick = (playerName) => {
    // Find player ID from name
    const playerId = playerNameToId.get(playerName);
    if (playerId) {
      setSelectedPlayer(playerId, playerName);
      setTimeout(() => setIsPlayerPanelOpen(true), 10);
    } else {
      // If player not found, try to use the parent's onPlayerClick if provided
      if (onPlayerClick) {
        onPlayerClick(playerName);
      }
    }
  };

  const handleClosePlayer = () => {
    setIsPlayerPanelOpen(false);
  };

  const handlePlayerChange = (newPlayerName) => {
    // Find player ID from name
    const playerId = playerNameToId.get(newPlayerName);
    if (playerId) {
      setSelectedPlayer(playerId, newPlayerName);
    }
  };

  const handleSideTabClick = () => {
    if (selectedPlayerId && playerSeasonStats) {
      setIsPlayerPanelOpen(true);
    } else if (allPlayerNames.length > 0 && playerNameToId.size > 0) {
      // Try to find current user's player first
      let playerToSelect = null;
      let playerNameToSelect = null;
      
      if (currentUserPlayer && currentUserPlayer.id) {
        const userMember = members.find(m => m.player_id === currentUserPlayer.id);
        if (userMember) {
          const playerName = allPlayerNames.find(name => {
            const id = playerNameToId.get(name);
            return id === currentUserPlayer.id;
          });
          
          if (playerName) {
            playerToSelect = currentUserPlayer.id;
            playerNameToSelect = playerName;
          }
        }
      }
      
      // Fall back to first player if current user not found
      if (!playerToSelect && allPlayerNames.length > 0) {
        const firstName = allPlayerNames[0];
        const firstId = playerNameToId.get(firstName);
        if (firstId) {
          playerToSelect = firstId;
          playerNameToSelect = firstName;
        }
      }
      
      if (playerToSelect && playerNameToSelect) {
        handlePlayerClick(playerNameToSelect);
      }
    }
  };

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
        onCreatePlayer={handleCreatePlayer}
        allPlayerNames={allPlayerNames}
        isLeagueMember={isLeagueMember}
        leagueId={leagueId}
        isAdmin={isLeagueAdmin}
        editingSessions={editingSessions}
        onEnterEditMode={handleEnterEditMode}
        onSaveEditedSession={handleSaveEditedSession}
        onCancelEdit={handleCancelEdit}
        pendingMatchChanges={pendingMatchChanges}
        editingSessionMetadata={editingSessionMetadata}
      />

      <PlayerDetailsPanel
        selectedPlayer={selectedPlayerName}
        playerStats={playerSeasonStats}
        playerMatchHistory={playerMatchHistory}
        isPanelOpen={isPlayerPanelOpen}
        allPlayerNames={allPlayerNames}
        onPlayerChange={handlePlayerChange}
        onClose={handleClosePlayer}
        onSideTabClick={handleSideTabClick}
        leagueName={league?.name}
        seasonName={activeSeason?.name}
      />
    </div>
  );
}

