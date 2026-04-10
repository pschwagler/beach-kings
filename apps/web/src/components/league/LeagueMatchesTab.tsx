import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { Swords, Plus, LayoutList, Clipboard, ClipboardList } from 'lucide-react';
import { useRouter } from 'next/navigation';
import MatchesTable from '../match/MatchesTable';

import { useLeague, ALL_SEASONS_KEY } from '../../contexts/LeagueContext';
import { useToast } from '../../contexts/ToastContext';
import { formatDateRange } from './utils/leagueUtils';
import { useAuth } from '../../contexts/AuthContext';
import { usePlayerDetailsDrawer } from './hooks/usePlayerDetailsDrawer';
import { transformMatchData, buildPlaceholderIdSet, type RawMatch } from './utils/matchUtils';
import { lockInLeagueSession, deleteSession, updateSession } from '../../services/api';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import CreateSeasonModal from './CreateSeasonModal';
import AddPlayersModal from './AddPlayersModal';

// Import custom hooks
import { useDataRefresh } from './hooks/useDataRefresh';
import { useMatchOperations } from './hooks/useMatchOperations';
import { useSessionEditing } from './hooks/useSessionEditing';
import { useActiveSession } from './hooks/useActiveSession';
import { useSessionSeasonUpdate } from './hooks/useSessionSeasonUpdate';
import { usePersistedViewMode } from '../../hooks/usePersistedViewMode';

const MIN_PLAYERS_FOR_MATCH = 4;

interface LeagueMatchesTabProps {
  seasonIdFromUrl?: number | null;
  autoOpenAddMatch?: boolean;
}

export default function LeagueMatchesTab({ seasonIdFromUrl = null, autoOpenAddMatch = false }: LeagueMatchesTabProps) {
  const router = useRouter();
  const { openModal } = useModal();
  const autoOpenFiredRef = useRef(false);
  const {
    league,
    leagueId,
    seasons,
    members,
    isSeasonActive,
    matchesSeasonData: selectedSeasonData,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    loadAllSeasonsRankings,
    refreshSeasonData,
    refreshMatchData,
    refreshAllSeasonsMatches,
    isLeagueAdmin,
    matchesSeasonId: selectedSeasonId,
    setMatchesSeasonId: setSelectedSeasonId,
    selectedPlayerId,
    selectedPlayerName,
    playerSeasonStats,
    playerMatchHistory,
    setSelectedPlayer,
    refreshSeasons,
    refreshMembers,
  } = useLeague();
  const { showToast } = useToast();
  const { currentUserPlayer } = useAuth();
  
  const MATCHES_VIEW_STORAGE_KEY = 'beach-kings:league-matches-view';

  // State for modals
  const [showCreateSeasonModal, setShowCreateSeasonModal] = useState(false);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);

  const [viewMode, setViewMode] = usePersistedViewMode(MATCHES_VIEW_STORAGE_KEY, 'cards');

  // Helper to get season ID for refreshing (use selected filter only)
  // Returns null when "All Seasons" is selected so useDataRefresh can refresh all seasons
  const getSeasonIdForRefresh = useCallback(() => {
    return selectedSeasonId || null;
  }, [selectedSeasonId]);

  // Use custom hooks
  const activeSessionHook = useActiveSession({
    leagueId,
    seasons,
    selectedSeasonId,
    refreshMatchData
  });
  const { activeSession, allSessions, loadActiveSession, loadAllSessions, refreshSession } = activeSessionHook;

  // Stabilize leagueHomeCourts so callers get a referentially stable empty array
  // instead of a new `[]` on every render when home_courts is falsy.
  const leagueHomeCourts = useMemo(
    () => league?.home_courts ?? [],
    [league?.home_courts]
  );

  // Build set of placeholder player IDs for match display badges
  const placeholderPlayerIds = useMemo(() => buildPlaceholderIdSet(members), [members]);

  // Refs for values used inside the autoOpenAddMatch effect but that should not
  // re-trigger it. The ref guard (autoOpenFiredRef) ensures the body runs once,
  // but unstable deps can still cause excessive effect invocations during init.
  const membersRef = useRef(members);
  membersRef.current = members;
  const leagueRef = useRef(league);
  leagueRef.current = league;
  const selectedSeasonIdRef = useRef(selectedSeasonId);
  selectedSeasonIdRef.current = selectedSeasonId;

  // Build player objects and name mappings from members
  const { allPlayers, allPlayerNames, playerNameToId, playerIdToName } = useMemo(() => {
    const idToName = new Map<number, string>();
    const nameToId = new Map<string, number>();
    const players: Array<{ id: number; name: string }> = [];
    if (members && members.length > 0) {
      members.forEach((m) => {
        const name = (m.player_name as string | undefined) || `Player ${m.player_id}`;
        idToName.set(m.player_id, name);
        nameToId.set(name, m.player_id);
        players.push({ id: m.player_id, name });
      });
    }
    const names = Array.from(nameToId.keys()).sort((a, b) => a.localeCompare(b));
    return {
      allPlayers: players,
      allPlayerNames: names,
      playerNameToId: nameToId,
      playerIdToName: idToName,
    };
  }, [members]);

  const allPlayerNamesRef = useRef(allPlayerNames);
  allPlayerNamesRef.current = allPlayerNames;

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
    refreshAllSeasonsMatches,
    getSeasonIdForRefresh,
    selectedSeasonId,
    seasons
  });
  const { refreshData } = dataRefresh;

  // Handle navigation from URL parameters (e.g., clicking from "My Games" dashboard)
  // Apply once on mount, then clear the URL param so the dropdown is free to change
  const seasonUrlAppliedRef = useRef(false);
  useEffect(() => {
    if (!seasonUrlAppliedRef.current && seasonIdFromUrl) {
      seasonUrlAppliedRef.current = true;
      setSelectedSeasonId(seasonIdFromUrl);
      // Clear the season param from the URL to prevent it from locking the dropdown
      const url = new URL(window.location.href);
      url.searchParams.delete('season');
      router.replace(url.pathname + url.search, { scroll: false });
    }
  }, [seasonIdFromUrl, setSelectedSeasonId, router]);

  // Season data loading is now handled automatically by LeagueContext when selectedSeasonId changes

  // Auto-open AddMatchModal when navigated from CreateGameModal with autoAddMatch param.
  // Uses refs for values that change during init but are only read inside the effect body.
  // Only `autoOpenAddMatch`, `seasons`, and stable callbacks remain in the dep array.
  useEffect(() => {
    if (!autoOpenAddMatch || autoOpenFiredRef.current) return;
    const currentMembers = membersRef.current;
    if (!currentMembers || currentMembers.length < MIN_PLAYERS_FOR_MATCH || !seasons || seasons.length === 0) return;

    autoOpenFiredRef.current = true;

    openModal(MODAL_TYPES.ADD_MATCH, {
      allPlayerNames: allPlayerNamesRef.current,
      leagueMatchOnly: true,
      defaultLeagueId: leagueId,
      members: currentMembers,
      league: leagueRef.current,
      defaultSeasonId: selectedSeasonIdRef.current,
      onSeasonChange: setSelectedSeasonId,
      onSubmit: async (matchData: Record<string, unknown>) => {
        const payload = { ...matchData, league_id: leagueId };
        await handleCreateMatch(payload);
      },
      onDelete: handleDeleteMatch,
      leagueHomeCourts,
      isFirstMatch: true,
    });

    // Clean URL param to prevent re-open on refresh
    const url = new URL(window.location.href);
    url.searchParams.delete('autoAddMatch');
    router.replace(url.pathname + url.search, { scroll: false });
    // handleCreateMatch/handleDeleteMatch are defined later in the function body;
    // safe because autoOpenFiredRef gates this to a single fire per mount and
    // the closures are only invoked after the full render completes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenAddMatch, seasons, leagueId, setSelectedSeasonId, openModal, router]);

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
    return transformMatchData(matchesData as RawMatch[], placeholderPlayerIds);
  }, [selectedSeasonData, placeholderPlayerIds]);

  const sessionEditing = useSessionEditing({
    matches,
    leagueId,
    refreshData,
    refreshSeasonData,
    getSeasonIdForRefresh
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
    refreshSeasonData,
    setSelectedSeasonId,
    seasonData,
    seasonDataLoadingMap,
    loadSeasonData,
    seasons,
    selectedSeasonId,
    getSeasonIdForRefresh
  });
  const { handleUpdateSessionSeason } = sessionSeasonUpdate;

  const handleUpdateSessionCourt = async (sessionId: number, courtId: number | null) => {
    try {
      await updateSession(sessionId, { court_id: courtId });
      await refreshSession();
    } catch (error) {
      console.error('Error updating session court:', error);
    }
  };

  // Session handlers
  const handleRefreshSession = async () => {
    await refreshSession();
  };

  const handleEndSession = async (sessionId: number) => {
    try {
      await lockInLeagueSession(leagueId, sessionId);

      // Schedule delayed stats refresh after backend has time to recalculate
      // This allows the async stat calculation job to complete
      if (refreshSeasonData && getSeasonIdForRefresh) {
        const seasonId = getSeasonIdForRefresh();
        if (seasonId) {
          setTimeout(() => {
            try {
              refreshSeasonData(seasonId);
            } catch (error) {
              console.error('[LeagueMatchesTab.handleEndSession] Error refreshing stats:', error);
              // Don't throw - stats refresh failure shouldn't affect session operation
            }
          }, 2000);
        }
      }

      await refreshData({ sessions: true, season: true, matches: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      showToast(e.response?.data?.detail || 'Failed to submit scores', 'error');
      throw err;
    }
  };

  const handleDeleteSession = async (sessionId: number) => {
    try {
      await deleteSession(sessionId);
      await refreshData({ sessions: true, season: true, matches: true });
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      showToast(e.response?.data?.detail || 'Failed to delete session', 'error');
      throw err;
    }
  };

  // Match handlers - use session editing routing
  const handleCreateMatch = async (matchData: Record<string, unknown>, sessionId: number | null = null) => {
    try {
      await sessionEditingCreateMatch(matchData, sessionId, matchOperations);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      showToast(e.response?.data?.detail || 'Failed to create game', 'error');
      throw err;
    }
  };

  const handleUpdateMatch = async (matchId: number, matchData: Record<string, unknown>, sessionId: number | null = null) => {
    try {
      await sessionEditingUpdateMatch(matchId, matchData, sessionId, matchOperations, matches ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      showToast(e.response?.data?.detail || 'Failed to update game', 'error');
      throw err;
    }
  };

  const handleDeleteMatch = async (matchId: number) => {
    try {
      await sessionEditingDeleteMatch(matchId, matchOperations, matches ?? []);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      showToast(e.response?.data?.detail || 'Failed to delete game', 'error');
      throw err;
    }
  };

  // Session editing handlers
  const handleEnterEditMode = (sessionId: number) => {
    enterEditMode(sessionId, matches);
  };

  const handleSaveEditedSession = async (sessionId: number) => {
    try {
      await saveEditedSession(sessionId, matchOperations);
    } catch (_err) {
      // Error already handled in hook
    }
  };

  const handleCancelEdit = (sessionId: number) => {
    cancelEdit(sessionId);
  };

  // Use shared hook for player details drawer logic with auto-selection
  const { handlePlayerClick } = usePlayerDetailsDrawer({
    seasonData: selectedSeasonData,
    allPlayers,
    leagueName: league?.name ?? '',
    seasonName: selectedSeasonId ? (seasons.find(s => s.id === selectedSeasonId)?.name ?? '') : '',
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
    
    return transformMatchData(matchesData as RawMatch[], placeholderPlayerIds);
  }, [activeSession, selectedSeasonId, seasonData, seasons, seasonDataLoadingMap, placeholderPlayerIds]);

  const handleCreateSeasonSuccess = async () => {
    await refreshSeasons();
    setShowCreateSeasonModal(false);
  };

  const handleAddPlayersSuccess = async () => {
    await refreshMembers();
    setShowAddPlayerModal(false);
  };

  // Check if there are less than 4 players
  const hasLessThanFourPlayers = !members || members.length < MIN_PLAYERS_FOR_MATCH;

  // Show empty state if no seasons
  if (!seasons || seasons.length === 0) {
    return (
      <>
        <div className="league-section">
          <div className="empty-state">
            <Swords size={48} className="large-empty-state-icon" />
            <p>No seasons found. Please create a season to log league games.</p>
            <button 
              className="league-text-button primary" 
              onClick={() => setShowCreateSeasonModal(true)}
              style={{ marginTop: '16px' }}
            >
              <Plus size={16} />
              Create Season
            </button>
          </div>
        </div>
        <CreateSeasonModal
          isOpen={showCreateSeasonModal}
          onClose={() => setShowCreateSeasonModal(false)}
          onSuccess={handleCreateSeasonSuccess}
        />
      </>
    );
  }

  // Show message if less than 4 players
  if (hasLessThanFourPlayers) {
    return (
      <>
        <div className="league-section">
          <div className="empty-state">
            <Swords size={48} className="large-empty-state-icon" />
            <p>This league has less than 4 registered players. Invite more players to begin logging league games.</p>
            <button 
              className="league-text-button primary" 
              onClick={() => setShowAddPlayerModal(true)}
              style={{ marginTop: '16px' }}
            >
              <Plus size={16} />
              Add Players
            </button>
          </div>
        </div>
        <AddPlayersModal
          isOpen={showAddPlayerModal}
          members={members}
          onClose={() => setShowAddPlayerModal(false)}
          onSuccess={handleAddPlayersSuccess}
        />
      </>
    );
  }

  return (
    <div className="league-section">
      {/* Header Row with Toggle and Season Selector */}
      <div className="rankings-filters-row" style={{ justifyContent: 'space-between', marginBottom: '20px' }}>
        {/* View Toggle */}
        <div className="view-toggle">
          <button 
            className={`view-toggle-button ${viewMode === 'cards' ? 'active' : ''}`}
            onClick={() => setViewMode('cards')}
            title="Card View"
          >
            <LayoutList size={18} />
            Cards
          </button>
          <button 
            className={`view-toggle-button ${viewMode === 'clipboard' ? 'active' : ''}`}
            onClick={() => setViewMode('clipboard')}
            title="Table View"
          >
            <ClipboardList size={18} />
            Table
          </button>
        </div>

        {seasons.length > 0 && (
          <div className="season-selector-wrapper">
            <select
              id="season-select-matches"
              data-testid="season-select-matches"
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
        )}
      </div>
      
      <MatchesTable
        matches={matches ?? []}
        onPlayerClick={handlePlayerClick}
        loading={selectedSeasonId
          ? (seasonDataLoadingMap[selectedSeasonId] || false)
          : (seasonDataLoadingMap[ALL_SEASONS_KEY] || false)
        }
        activeSession={
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
        playerIdToName={playerIdToName}
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
        onUpdateSessionCourt={handleUpdateSessionCourt}
        leagueHomeCourts={leagueHomeCourts}
        onSeasonChange={setSelectedSeasonId}
        onRefreshData={refreshData}
        contentVariant={viewMode === 'clipboard' ? 'clipboard' : 'cards'}
      />
      <CreateSeasonModal
        isOpen={showCreateSeasonModal}
        onClose={() => setShowCreateSeasonModal(false)}
        onSuccess={handleCreateSeasonSuccess}
      />
      <AddPlayersModal
        isOpen={showAddPlayerModal}
        members={members}
        onClose={() => setShowAddPlayerModal(false)}
        onSuccess={handleAddPlayersSuccess}
      />
    </div>
  );
}
