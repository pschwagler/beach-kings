import { useEffect, useMemo, useRef } from 'react';
import MatchesTable from '../match/MatchesTable';

import { useLeague } from '../../contexts/LeagueContext';
import { formatDateRange } from './utils/leagueUtils';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerDetailsDrawer } from './hooks/usePlayerDetailsDrawer';
import { transformMatchData } from './utils/matchUtils';
import { lockInLeagueSession, deleteSession } from '../../services/api';

// Import custom hooks
import { useDataRefresh } from './hooks/useDataRefresh';
import { useMatchOperations } from './hooks/useMatchOperations';
import { useSessionEditing } from './hooks/useSessionEditing';
import { useActiveSession } from './hooks/useActiveSession';
import { usePlayerNameMapping } from './hooks/usePlayerNameMapping';
import { useSessionSeasonUpdate } from './hooks/useSessionSeasonUpdate';

export default function LeagueMatchesTab() {
  const { 
    league, 
    leagueId,
    seasons, 
    members, 
    isSeasonActive,
    selectedSeasonData,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    loadAllSeasonsRankings,
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
  
  // Ref to track session that should be scrolled into view
  const sessionToScrollRef = useRef(null);

  // Helper to get season ID for refreshing (use selected filter only)
  // Returns null when "All Seasons" is selected so useDataRefresh can refresh all seasons
  const getSeasonIdForRefresh = useMemo(() => {
    return () => selectedSeasonId || null;
  }, [selectedSeasonId]);

  // Use custom hooks
  const activeSessionHook = useActiveSession({
    leagueId,
    seasons,
    selectedSeasonId,
    refreshMatchData
  });
  const { activeSession, allSessions, loadActiveSession, loadAllSessions, refreshSession } = activeSessionHook;

  const playerNameMapping = usePlayerNameMapping({ leagueId, members });
  const { allPlayerNames, playerNameToId, getPlayerIdFromMap } = playerNameMapping;

  const matchOperations = useMatchOperations({
    playerNameToId,
    refreshMatchData,
    getSeasonIdForRefresh,
    loadActiveSession,
    loadAllSessions
  });

  const dataRefresh = useDataRefresh({
    loadActiveSession,
    loadAllSessions,
    refreshSeasonData,
    refreshMatchData,
    getSeasonIdForRefresh,
    selectedSeasonId,
    seasons
  });
  const { refreshData } = dataRefresh;

  // Load season data when filter changes
  useEffect(() => {
    if (selectedSeasonId) {
      // Load specific season if not already loaded
      if (!seasonData[selectedSeasonId]) {
        loadSeasonData(selectedSeasonId);
      }
    } else {
      // "All Seasons" selected - load all seasons rankings (like RankingsTab does)
      loadAllSeasonsRankings();
    }
  }, [selectedSeasonId, seasonData, loadSeasonData, loadAllSeasonsRankings]);

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

  const sessionEditing = useSessionEditing({
    matches,
    leagueId,
    refreshData,
    showMessage
  });
  const {
    editingSessions,
    pendingMatchChanges,
    editingSessionMetadata,
    enterEditMode,
    cancelEdit,
    saveEditedSession,
    handleCreateMatch: sessionEditingCreateMatch,
    handleUpdateMatch: sessionEditingUpdateMatch,
    handleDeleteMatch: sessionEditingDeleteMatch
  } = sessionEditing;

  const sessionSeasonUpdate = useSessionSeasonUpdate({
    activeSession,
    editingSessions,
    matches,
    refreshData,
    setSelectedSeasonId,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    seasons,
    selectedSeasonId,
    getSeasonIdForRefresh,
    showMessage
  });
  const { handleUpdateSessionSeason } = sessionSeasonUpdate;

  // Session handlers
  const handleRefreshSession = async () => {
    await refreshSession();
  };

  const handleEndSession = async (sessionId) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);
      await refreshData({ sessions: true, season: true, matches: true });
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to submit scores');
      throw err;
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await deleteSession(sessionId);
      await refreshData({ sessions: true, season: true, matches: true });
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete session');
      throw err;
    }
  };

  // Match handlers - use session editing routing
  const handleCreateMatch = async (matchData, sessionId = null) => {
    try {
      await sessionEditingCreateMatch(matchData, sessionId, matchOperations);
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to create game');
      throw err;
    }
  };

  const handleUpdateMatch = async (matchId, matchData, sessionId = null) => {
    try {
      await sessionEditingUpdateMatch(matchId, matchData, sessionId, matchOperations, matches);
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to update game');
      throw err;
    }
  };

  const handleDeleteMatch = async (matchId) => {
    try {
      await sessionEditingDeleteMatch(matchId, matchOperations, matches);
    } catch (err) {
      showMessage?.('error', err.response?.data?.detail || 'Failed to delete game');
      throw err;
    }
  };

  // Session editing handlers
  const handleEnterEditMode = (sessionId) => {
    enterEditMode(sessionId, matches);
  };

  const handleSaveEditedSession = async (sessionId) => {
    try {
      await saveEditedSession(sessionId, matchOperations);
    } catch (err) {
      // Error already handled in hook
    }
  };

  const handleCancelEdit = (sessionId) => {
    cancelEdit(sessionId);
  };

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
    members,
    selectedSeasonId,
  });

  // Load active session's season data if it's different from selected season and not loaded yet
  useEffect(() => {
    if (!activeSession || !activeSession.season_id) return;
    
    // If active session is in the currently selected season, data is already loaded
    if (activeSession.season_id === selectedSeasonId || 
        (!selectedSeasonId && seasons.some(s => s.id === activeSession.season_id))) {
      return;
    }
    
    // Active session is in a different season - ensure that season's data is loaded
    const sessionSeasonData = seasonData[activeSession.season_id];
    if (!sessionSeasonData?.matches && !seasonDataLoadingMap[activeSession.season_id]) {
      loadSeasonData(activeSession.season_id);
    }
  }, [activeSession, selectedSeasonId, seasonData, seasons, seasonDataLoadingMap, loadSeasonData]);

  // Get active session's matches from its season if different from selected season
  const activeSessionMatchesFromSeason = useMemo(() => {
    if (!activeSession || !activeSession.season_id) return null;
    
    // If active session is in the currently selected season, matches will come from the matches prop
    if (activeSession.season_id === selectedSeasonId || 
        (!selectedSeasonId && seasons.some(s => s.id === activeSession.season_id))) {
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
  }, [activeSession, selectedSeasonId, seasonData, seasons, seasonDataLoadingMap]);

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
          : (seasonDataLoadingMap['all-seasons'] || false)
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
        sessionToScrollRef={sessionToScrollRef}
        onSeasonChange={setSelectedSeasonId}
      />
    </div>
  );
}
