import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import MatchesTable from '../match/MatchesTable';

import { useLeague } from '../../contexts/LeagueContext';
import { formatDateRange } from './utils/leagueUtils';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerDetailsDrawer } from './hooks/usePlayerDetailsDrawer';
import { transformMatchData } from './utils/matchUtils';
import { 
  createMatch, 
  updateMatch, 
  deleteMatch, 
  getActiveSession,
  getSessions,
  lockInLeagueSession,
  deleteSession,
  getPlayers,
  updateSessionSeason
} from '../../services/api';

export default function LeagueMatchesTab() {
  const { 
    league, 
    leagueId,
    seasons, 
    members, 
    activeSeason,
    activeSeasons,
    isSeasonActive,
    activeSeasonData,
    selectedSeasonData,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    refreshSeasonData,
    refreshMatchData,
    isLeagueAdmin,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    setSelectedPlayer,
    showMessage
  } = useLeague();
  const { currentUserPlayer } = useAuth();
  const [activeSession, setActiveSession] = useState(null);
  const [allSessions, setAllSessions] = useState([]);
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
  
  // Ref to track session that should be scrolled into view
  const sessionToScrollRef = useRef(null);

  // Get season data for selected filter
  // Use selectedSeasonData from context (computed once for consistency)

  // Load season data when filter changes
  useEffect(() => {
    if (selectedSeasonId) {
      // Load specific season if not already loaded
      if (!seasonData[selectedSeasonId]) {
        loadSeasonData(selectedSeasonId);
      }
    } else {
      // "All Seasons" selected - load all seasons in the league
      seasons.forEach(season => {
        if (!seasonData[season.id]) {
          loadSeasonData(season.id);
        }
      });
    }
  }, [selectedSeasonId, seasonData, loadSeasonData, seasons]);

  // Transform matches from context for display
  const matches = useMemo(() => {
    // If selectedSeasonData doesn't exist yet, return null (data not loaded)
    if (!selectedSeasonData) return null;
    // If matches property exists (even if empty array), transform it
    // An empty array means "no matches for this season" (valid state - should show add matches card)
    // null/undefined means "data not loaded yet"
    const matchesData = selectedSeasonData.matches;
    if (matchesData === undefined || matchesData === null) {
      // Data loaded but no matches property - treat as empty array
      // This allows the add matches card to show for seasons with no matches
      return [];
    }
    return transformMatchData(matchesData);
  }, [selectedSeasonData]);

  // Helper to get season ID for refreshing (use selected filter, or fall back to activeSeason)
  const getSeasonIdForRefresh = useCallback(() => {
    return selectedSeasonId || activeSeason?.id;
  }, [selectedSeasonId, activeSeason]);

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

  const loadAllSessions = useCallback(async () => {
    if (!leagueId) return;
    try {
      const sessions = await getSessions().catch(() => []);
      // Filter sessions by league if they have season_id that matches our league's seasons
      const leagueSeasonIds = new Set(seasons.map(s => s.id));
      const leagueSessions = sessions.filter(session => 
        session.season_id && leagueSeasonIds.has(session.season_id)
      );
      setAllSessions(leagueSessions);
    } catch (err) {
      console.error('Error loading all sessions:', err);
      setAllSessions([]);
    }
  }, [leagueId, seasons]);

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

  // Load active session and all sessions on mount and when dependencies change
  useEffect(() => {
    if (leagueId && league && seasons.length > 0) {
      loadActiveSession();
      loadAllSessions();
    }
  }, [leagueId, league, seasons, loadActiveSession, loadAllSessions]);

  // Polling: Check for new matches every 5 seconds if there's an active session
  // Uses refreshMatchData to update context - component will automatically update via selectedSeasonData
  useEffect(() => {
    if (!activeSession || !selectedSeasonId) {
      return;
    }

    const pollForNewMatches = async () => {
      try {
        // Refresh match data in context for the selected season
        await refreshMatchData(selectedSeasonId);
      } catch (err) {
        console.error('Error polling for new matches:', err);
      }
    };
    const pollInterval = setInterval(pollForNewMatches, 5000); // Poll every 5 seconds

    return () => clearInterval(pollInterval);
  }, [activeSession, selectedSeasonId, refreshMatchData]);

  const handleRefreshSession = async () => {
    // Just refresh the session state without creating a new one
    await loadActiveSession();
    await loadAllSessions();
    // Refresh match data in context for selected season or all active seasons
    if (selectedSeasonId) {
      await refreshMatchData(selectedSeasonId);
    } else if (activeSeasons.length > 0) {
      // Refresh all active seasons when "All Seasons" is selected
      await Promise.all(activeSeasons.map(s => refreshMatchData(s.id)));
    }
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);
      // Clear active session and reload all sessions
      await loadActiveSession();
      await loadAllSessions();
      // Refresh season data in context for stats/rankings (other components may need this)
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
      // Reload matches directly - force refresh to get latest data
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
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
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete session');
      throw err;
    }
  };

  const handleCreateMatch = async (matchData, sessionId = null) => {
    try {
      // Match data now contains player IDs directly, no conversion needed
      
      // If we're editing a session, store the change locally instead of making API call
      if (sessionId && editingSessions.has(sessionId)) {
        setPendingMatchChanges(prev => {
          const next = new Map(prev);
          const sessionChanges = next.get(sessionId) || { updates: new Map(), additions: [], deletions: [] };
          sessionChanges.additions.push(matchData);
          next.set(sessionId, sessionChanges);
          return next;
        });
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await createMatch(matchData);
      
      // Reload active session and all sessions (may have been created by the first match)
      await loadActiveSession();
      await loadAllSessions();
      
      // Reload matches directly - force refresh to get latest data
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create game');
      throw err;
    }
  };

  const handleUpdateMatch = async (matchId, matchData, sessionId = null) => {
    try {
      // Convert match data to use player IDs
      // Check if data already has IDs (from AddMatchModal) or names (from table editing)
      const getPlayerId = (playerValue) => {
        // If it's already an ID (number), return it
        if (typeof playerValue === 'number') {
          return playerValue;
        }
        // If it's an object with value (from player dropdown), use the value
        if (typeof playerValue === 'object' && playerValue !== null && 'value' in playerValue) {
          return playerValue.value;
        }
        // If it's a string (player name), convert to ID
        if (typeof playerValue === 'string') {
          return playerNameToId.get(playerValue) || null;
        }
        return null;
      };
      
      // Build match payload with player IDs
      const matchPayload = {
        ...matchData,
        team1_player1_id: getPlayerId(matchData.team1_player1_id || matchData.team1_player1),
        team1_player2_id: getPlayerId(matchData.team1_player2_id || matchData.team1_player2),
        team2_player1_id: getPlayerId(matchData.team2_player1_id || matchData.team2_player1),
        team2_player2_id: getPlayerId(matchData.team2_player2_id || matchData.team2_player2),
        team1_score: matchData.team1_score,
        team2_score: matchData.team2_score,
        is_public: matchData.is_public,
        is_ranked: matchData.is_ranked
      };
      
      // Validate all player IDs are provided
      if (!matchPayload.team1_player1_id || !matchPayload.team1_player2_id || 
          !matchPayload.team2_player1_id || !matchPayload.team2_player2_id) {
        throw new Error('All four players must be selected');
      }
      
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
                sessionChanges.additions[index] = matchPayload;
              } else {
                // Index not found, add as new addition
                sessionChanges.additions.push(matchPayload);
              }
            } else {
              // Invalid temp ID format, add as new addition
              sessionChanges.additions.push(matchPayload);
            }
          } else {
            // Existing match being edited - store in updates
            sessionChanges.updates.set(matchId, matchPayload);
          }
          
          next.set(sessionId, sessionChanges);
          return next;
        });
        // Don't reload matches - UI will update from pendingMatchChanges state
        return;
      }
      
      await updateMatch(matchId, matchPayload);
      // Reload matches directly - force refresh to get latest data
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
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
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
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
      
      // Clear active session and reload all sessions
      await loadActiveSession();
      await loadAllSessions();
      // Refresh season data in context for stats/rankings (other components may need this)
      if (activeSeason?.id) {
        await refreshSeasonData(activeSeason.id);
      }
      // Reload matches directly - force refresh to get latest data
      const seasonId = getSeasonIdForRefresh();
      if (seasonId) {
        await refreshMatchData(seasonId);
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
    const seasonId = getSeasonIdForRefresh();
    if (seasonId) {
      refreshMatchData(seasonId);
    }
  };

  const handleUpdateSessionSeason = async (sessionId, seasonId) => {
    try {
      // Get the old season_id before updating (from active session or from matches)
      let oldSeasonId = null;
      const isActiveSession = activeSession && activeSession.id === sessionId;
      const isEditingSession = editingSessions.has(sessionId);
      
      if (isActiveSession) {
        oldSeasonId = activeSession.season_id;
      } else {
        // Try to get it from the matches data
        const sessionMatch = matches?.find(m => m['Session ID'] === sessionId);
        if (sessionMatch) {
          oldSeasonId = sessionMatch['Session Season ID'];
        }
      }
      
      await updateSessionSeason(sessionId, seasonId);
      
      // If this is the active session and we're moving to a different season,
      // ensure the new season's data is loaded BEFORE reloading the active session
      // This prevents the active session from showing without matches
      if (isActiveSession && seasonId && seasonId !== oldSeasonId) {
        // Load the new season's data if not already loaded
        // This is critical: we need the data loaded before the active session state updates
        // so that activeSessionMatchesFromSeason can find the matches
        if (!seasonData[seasonId]?.matches && !seasonDataLoadingMap[seasonId]) {
          await loadSeasonData(seasonId);
          // Give React a chance to update state after loadSeasonData completes
          // The loadSeasonData function updates state asynchronously, so we need to wait
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Reload active session and all sessions to get updated season_id
      // This will trigger a re-render, and activeSessionMatchesFromSeason should now have data
      await loadActiveSession();
      await loadAllSessions();
      
      // Refresh match data for both old and new seasons
      const seasonsToRefresh = new Set();
      
      // Add new season
      if (seasonId) {
        seasonsToRefresh.add(seasonId);
      }
      
      // Add old season if it exists and is different
      if (oldSeasonId && oldSeasonId !== seasonId) {
        seasonsToRefresh.add(oldSeasonId);
      }
      
      // Also refresh the currently selected season if it's different
      const currentSeasonId = getSeasonIdForRefresh();
      if (currentSeasonId) {
        seasonsToRefresh.add(currentSeasonId);
      }
      
      // Ensure the new season's data is loaded if it's not already loaded (for non-active sessions)
      if (seasonId && !isActiveSession && !seasonData[seasonId]?.matches && !seasonDataLoadingMap[seasonId]) {
        await loadSeasonData(seasonId);
      }
      
      // Refresh all affected seasons (force clear to ensure fresh data)
      await Promise.all(Array.from(seasonsToRefresh).map(sid => refreshMatchData(sid, true)));
      
      // If "All Seasons" is selected, also refresh all active seasons to ensure matches appear correctly
      if (!selectedSeasonId && activeSeasons.length > 0) {
        await Promise.all(activeSeasons.map(s => refreshMatchData(s.id, true)));
      }
      
      // If the session was moved to a different season than the currently selected filter,
      // switch to "All Seasons" so the user can see the updated session
      if (seasonId && selectedSeasonId && seasonId !== selectedSeasonId) {
        setSelectedSeasonId(null); // null means "All Seasons"
        // Mark this session to be scrolled into view after the filter change
        sessionToScrollRef.current = sessionId;
      }
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update session season');
      throw err;
    }
  };

  // Helper to get player ID from name using playerNameToId map
  const getPlayerIdFromMap = useCallback((playerName) => {
    return playerNameToId.get(playerName) || null;
  }, [playerNameToId]);

  // Use shared hook for player details drawer logic with auto-selection
  const { handlePlayerClick, handlePlayerChange } = usePlayerDetailsDrawer({
    seasonData: selectedSeasonData,
    getPlayerId: getPlayerIdFromMap,
    allPlayerNames,
    leagueName: league?.name,
    seasonName: selectedSeasonId ? seasons.find(s => s.id === selectedSeasonId)?.name : null,
    selectedPlayerId,
    selectedPlayerName,
    setSelectedPlayer,
    precomputedStats: playerSeasonStats,
    precomputedMatchHistory: playerMatchHistory,
    autoSelect: true,
    currentUserPlayer,
    activeSeason,
    members,
    selectedSeasonId,
  });

  // Load active session's season data if it's different from selected season and not loaded yet
  useEffect(() => {
    if (!activeSession || !activeSession.season_id) return;
    
    // If active session is in the currently selected season, data is already loaded
    if (activeSession.season_id === selectedSeasonId || 
        (!selectedSeasonId && activeSeasons.some(s => s.id === activeSession.season_id))) {
      return;
    }
    
    // Active session is in a different season - ensure that season's data is loaded
    const sessionSeasonData = seasonData[activeSession.season_id];
    if (!sessionSeasonData?.matches && !seasonDataLoadingMap[activeSession.season_id]) {
      loadSeasonData(activeSession.season_id);
    }
  }, [activeSession, selectedSeasonId, seasonData, activeSeasons, seasonDataLoadingMap, loadSeasonData]);

  // Get active session's matches from its season if different from selected season
  const activeSessionMatchesFromSeason = useMemo(() => {
    if (!activeSession || !activeSession.season_id) return null;
    
    // If active session is in the currently selected season, matches will come from the matches prop
    if (activeSession.season_id === selectedSeasonId || 
        (!selectedSeasonId && activeSeasons.some(s => s.id === activeSession.season_id))) {
      return null; // Will use matches from selectedSeasonData
    }
    
    // Active session is in a different season - get matches from that season's data
    const sessionSeasonData = seasonData[activeSession.season_id];
    const isDataLoading = seasonDataLoadingMap[activeSession.season_id];
    
    // If data is loading, return empty array (not null) to prevent fallback to filtered matches
    // This ensures the active session shows with empty matches while loading, rather than
    // falling back to the filtered matches which won't have matches from the new season
    if (!sessionSeasonData) {
      if (isDataLoading) {
        return []; // Data is loading - return empty array to prevent fallback
      }
      return null; // Data not loaded and not loading - will trigger useEffect to load it
    }
    
    // If matches property exists (even if empty array), transform it
    // An empty array means "no matches for this season" (valid state)
    // null/undefined means "data not loaded yet"
    const matchesData = sessionSeasonData.matches;
    if (matchesData === undefined || matchesData === null) {
      // Data structure exists but matches not loaded yet
      if (isDataLoading) {
        return []; // Return empty array while loading to prevent fallback
      }
      return null; // Data loaded but no matches property yet
    }
    
    return transformMatchData(matchesData);
  }, [activeSession, selectedSeasonId, seasonData, activeSeasons, seasonDataLoadingMap]);

  return (
    <div className="league-section">
      {/* Season Selector - Top Right */}
      {seasons.length > 0 && (
        <div className="rankings-filters-row" style={{ justifyContent: 'flex-end' }}>
          <div className="season-selector-wrapper">
            <select
              id="season-select-matches"
              value={selectedSeasonId || ''}
              onChange={(e) => {
                const value = e.target.value;
                setSelectedSeasonId(value ? Number(value) : null);
              }}
              className="season-selector-dropdown"
            >
              <option value="">All Seasons</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name} {isSeasonActive(season) ? '(Active)' : ''}
                  {season.start_date && season.end_date ? ` - ${formatDateRange(season.start_date, season.end_date)}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      
      <MatchesTable
        matches={matches}
        onPlayerClick={handlePlayerClick}
        loading={selectedSeasonId 
          ? (seasonDataLoadingMap[selectedSeasonId] || false)
          : (activeSeason?.id ? (seasonDataLoadingMap[activeSeason.id] || false) : false)
        }
        activeSession={
          // Always show active session regardless of selected season filter
          activeSession || null
        }
        allSessions={allSessions}
        activeSessionMatchesOverride={activeSessionMatchesFromSeason}
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
        seasons={seasons}
        selectedSeasonId={selectedSeasonId}
        onUpdateSessionSeason={handleUpdateSessionSeason}
        activeSeasons={activeSeasons}
        sessionToScrollRef={sessionToScrollRef}
        onSeasonChange={setSelectedSeasonId}
      />
    </div>
  );
}

