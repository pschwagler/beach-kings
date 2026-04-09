import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trophy, Users, ChevronDown, Camera } from 'lucide-react';
import type { Season, Match, Session } from '../../types';

/** Minimal court shape used for the home-court selector (must match ActiveSessionPanel's Court). */
interface HomeCourt {
  id: number;
  name: string;
  slug?: string | null;
}
import MatchCard from './MatchCard';
import SessionMatchesClipboardTable from './SessionMatchesClipboardTable';

/**
 * Flat display row format used throughout MatchesTable — produced by the backend
 * query that joins sessions + matches.
 * Re-exported from matchUtils for callers that import from MatchesTable.
 */
export type { DisplayMatch as MatchDisplayRow } from '../league/utils/matchUtils';

/** Changes accumulated in edit mode for a single session. */
export interface SessionChanges {
  deletions: number[];
  updates: Map<number, Record<string, unknown>>;
  additions: Record<string, unknown>[];
}

/** Session metadata stored while a session is in edit mode. */
export interface SessionMetadata {
  name?: string;
  status?: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

interface MatchesTableProps {
  matches: DisplayMatch[];
  onPlayerClick: (playerId: number | string, playerName: string, e: React.MouseEvent) => void;
  loading?: boolean;
  activeSession?: Session | null;
  allSessions?: Session[];
  onCreateSession?: () => Promise<void>;
  onEndSession?: (sessionId: number) => Promise<void>;
  onDeleteSession?: (sessionId: number) => Promise<void>;
  onCreateMatch?: (matchData: Record<string, unknown>, sessionId?: number | null) => Promise<void>;
  onUpdateMatch?: (matchId: number, matchData: Record<string, unknown>, sessionId?: number | null) => Promise<void>;
  onDeleteMatch?: (matchId: number) => Promise<void>;
  allPlayerNames?: string[];
  playerIdToName?: Map<number, string>;
  leagueId?: number | null;
  isAdmin?: boolean;
  editingSessions?: Set<number>;
  onEnterEditMode?: (sessionId: number) => void;
  onSaveEditedSession?: (sessionId: number) => Promise<void>;
  onCancelEdit?: (sessionId: number) => void;
  pendingMatchChanges?: Map<number, SessionChanges>;
  editingSessionMetadata?: Map<number, SessionMetadata>;
  seasons?: Season[];
  selectedSeasonId?: number | null;
  onUpdateSessionSeason?: ((sessionId: number, seasonId: number | null) => Promise<void>) | null;
  onUpdateSessionCourt?: ((sessionId: number, courtId: number | null) => Promise<void>) | null;
  leagueHomeCourts?: HomeCourt[];
  activeSessionMatchesOverride?: DisplayMatch[] | null;
  activeSeasons?: Season[];
  onSeasonChange?: ((seasonId: number | null) => void) | null;
  onRefreshData?: ((options?: { sessions?: boolean; season?: boolean; matches?: boolean; seasonId?: number | null; forceClear?: boolean }) => Promise<void>) | null;
  contentVariant?: string;
}


import ActiveSessionPanel from '../session/ActiveSessionPanel';
import SessionGroupHeader from '../session/SessionGroupHeader';
import { MatchesTableSkeleton } from '../ui/Skeletons';
import { useLeague } from '../../contexts/LeagueContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { formatRelativeTime } from '../../utils/dateUtils';
import { calculateWinner, type DisplayMatch } from '../league/utils/matchUtils';

/** A group keyed by date (non-session matches). */
interface DateGroup {
  type: 'date';
  name: string | null | undefined;
  createdAt: null;
  lastUpdated: null;
  createdBy: null;
  updatedBy: null;
  matches: DisplayMatch[];
}

/** Either a session group or a date group. */
type MatchGroup = ReturnType<typeof createSessionGroup> | DateGroup;

/**
 * Comparator for sorting session/date groups in descending order.
 *
 * Primary key: `date` (YYYY-MM-DD) — descending lexicographic comparison.
 * When `date` is absent on either side the date comparison is skipped entirely
 * to avoid using the display name string as a proxy date.
 * Tiebreaker: `createdAt` timestamp — descending.
 * Groups that have a `createdAt` value sort before groups that do not.
 */
export function compareSessionGroups(
  a: { date?: string | null; createdAt?: string | null },
  b: { date?: string | null; createdAt?: string | null }
): number {
  const dateA = a.date ?? null;
  const dateB = b.date ?? null;

  if (dateA && dateB) {
    const dateCmp = dateB.localeCompare(dateA);
    if (dateCmp !== 0) return dateCmp;
  }

  const createdA = a.createdAt ?? null;
  const createdB = b.createdAt ?? null;

  if (createdA && createdB) {
    const timeDiff = Date.parse(createdB) - Date.parse(createdA);
    if (timeDiff !== 0) return timeDiff;
  }

  if (createdA && !createdB) return -1;
  if (!createdA && createdB) return 1;

  return 0;
}

function createSessionGroup(
  sessionId: number | string,
  sessionName: string,
  sessionStatus: string,
  sessionCreatedAt: string | null,
  sessionUpdatedAt: string | null,
  sessionCreatedBy: string | null,
  sessionUpdatedBy: string | null,
  sessionDate: string | null
) {
  return {
    type: 'session',
    id: sessionId,
    name: sessionName,
    status: sessionStatus,
    isActive: sessionStatus === 'ACTIVE',
    date: sessionDate || null,
    createdAt: sessionCreatedAt,
    updatedAt: sessionUpdatedAt,
    createdBy: sessionCreatedBy,
    updatedBy: sessionUpdatedBy,
    lastUpdated: sessionUpdatedAt || sessionCreatedAt,
    matches: [] as DisplayMatch[],
  };
}

const EMPTY_PLAYER_MAP = new Map<number, string>();
const EMPTY_SESSIONS_SET = new Set<number>();
const EMPTY_MATCH_CHANGES_MAP = new Map<number, SessionChanges>();
const EMPTY_SESSION_METADATA_MAP = new Map<number, SessionMetadata>();

export default function MatchesTable({
  matches,
  onPlayerClick,
  loading,
  activeSession,
  allSessions = [],
  onCreateSession,
  onEndSession,
  onDeleteSession,
  onCreateMatch,
  onUpdateMatch,
  onDeleteMatch,
  allPlayerNames,
  playerIdToName = EMPTY_PLAYER_MAP,
  leagueId = null,
  isAdmin = false,
  editingSessions = EMPTY_SESSIONS_SET,
  onEnterEditMode,
  onSaveEditedSession,
  onCancelEdit,
  pendingMatchChanges = EMPTY_MATCH_CHANGES_MAP,
  editingSessionMetadata = EMPTY_SESSION_METADATA_MAP,
  seasons = [],
  selectedSeasonId = null,
  onUpdateSessionSeason = null,
  onUpdateSessionCourt = null,
  leagueHomeCourts = [],
  activeSessionMatchesOverride = null,
  activeSeasons = [],
  onSeasonChange = null,
  onRefreshData = null,
  contentVariant = 'cards'
}: MatchesTableProps) {
  const { isLeagueMember, members, league } = useLeague();
  const { openModal, closeModal } = useModal();
  // Photo upload state
  const [photoJobId, setPhotoJobId] = useState<string | null>(null);
  const [photoSessionId, setPhotoSessionId] = useState<number | null>(null);
  
  const handlePhotoMatchesCreated = useCallback(async (matchIds: number[], photoSeasonId: number | null) => {
    setPhotoJobId(null);
    setPhotoSessionId(null);
    closeModal();

    // Switch to the season where matches were created (if different from current filter)
    if (photoSeasonId && onSeasonChange && photoSeasonId !== selectedSeasonId) {
      onSeasonChange(photoSeasonId);
    }

    // Refresh data to show the newly created matches
    if (onRefreshData) {
      try {
        await onRefreshData({ sessions: true, season: true, matches: true, seasonId: photoSeasonId || undefined });
      } catch (error) {
        console.error('[MatchesTable] Error refreshing data after photo matches created:', error);
      }
    }
  }, [closeModal, onRefreshData, onSeasonChange, selectedSeasonId]);
  
  const handleProceedToPhotoReview = useCallback((jobId: string, sessionId: number | null, uploadedImageUrl: string | null = null) => {
    setPhotoJobId(jobId);
    setPhotoSessionId(sessionId);
    openModal(MODAL_TYPES.REVIEW_PHOTO_MATCHES, {
      leagueId,
      jobId,
      sessionId,
      seasonId: selectedSeasonId,
      seasons,
      uploadedImageUrl,
      onSuccess: handlePhotoMatchesCreated
    });
  }, [leagueId, selectedSeasonId, seasons, openModal, handlePhotoMatchesCreated]);

  const matchesWithPendingChanges = useMemo(() => {    
    if (matches === null) return null;
    if (pendingMatchChanges.size === 0) return matches;

    let updatedMatches = [...matches];

    pendingMatchChanges.forEach((sessionChanges, sessionId) => {
      if (sessionChanges.deletions?.length > 0) {
        updatedMatches = updatedMatches.filter(m => !sessionChanges.deletions.includes(m.id as number));
      }
      
      sessionChanges.updates.forEach((updatedData: Record<string, unknown>, matchId: number) => {
        const matchIndex = updatedMatches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          const match = updatedMatches[matchIndex];
          const team1Score = updatedData.team1_score !== undefined ? updatedData.team1_score : match.team_1_score;
          const team2Score = updatedData.team2_score !== undefined ? updatedData.team2_score : match.team_2_score;

          updatedMatches[matchIndex] = {
            ...match,
            team_1_player_1: (updatedData.team1_player1 as string | undefined) || match.team_1_player_1,
            team_1_player_2: (updatedData.team1_player2 as string | undefined) || match.team_1_player_2,
            team_2_player_1: (updatedData.team2_player1 as string | undefined) || match.team_2_player_1,
            team_2_player_2: (updatedData.team2_player2 as string | undefined) || match.team_2_player_2,
            team_1_score: team1Score as number | null,
            team_2_score: team2Score as number | null,
            winner: calculateWinner(team1Score as number, team2Score as number)
          };
        }
      });

      sessionChanges.additions.forEach((newMatchData: Record<string, unknown>, index: number) => {
        const sessionMatch = updatedMatches.find(m => m.session_id === sessionId);
        const sessionName = sessionMatch?.session_name || 'New Session';

        // Convert player IDs to names using the reverse map
        // Match data has team1_player1_id, team1_player2_id, etc.
        const getPlayerName = (playerId: string | number | null | undefined) => {
          if (!playerId) return '';
          // Handle both ID format (number) and name format (string) for backwards compatibility
          if (typeof playerId === 'string' && !/^\d+$/.test(playerId)) {
            return playerId; // Already a name
          }
          const name = playerIdToName.get(Number(playerId)) || '';
          return name;
        };

        const pendingMatch: DisplayMatch = {
          id: `pending-${sessionId}-${index}`,
          Date: new Date().toISOString().split('T')[0],
          session_id: sessionId,
          session_name: sessionName as string | null,
          session_status: 'ACTIVE',
          team_1_player_1: getPlayerName((newMatchData.team1_player1_id || newMatchData.team1_player1) as string | number | null | undefined),
          team_1_player_2: getPlayerName((newMatchData.team1_player2_id || newMatchData.team1_player2) as string | number | null | undefined),
          team_2_player_1: getPlayerName((newMatchData.team2_player1_id || newMatchData.team2_player1) as string | number | null | undefined),
          team_2_player_2: getPlayerName((newMatchData.team2_player2_id || newMatchData.team2_player2) as string | number | null | undefined),
          team_1_score: newMatchData.team1_score as number | null,
          team_2_score: newMatchData.team2_score as number | null,
          winner: calculateWinner(newMatchData.team1_score as number, newMatchData.team2_score as number),
          team_1_elo_change: 0,
          team_2_elo_change: 0,
        };
        updatedMatches.push(pendingMatch);
      });
    });

    return updatedMatches;
  }, [matches, pendingMatchChanges, playerIdToName]);

  // Create a map of sessionId -> session data for quick lookup
  const sessionsMap = useMemo(() => {
    const map = new Map<number, Session>();
    allSessions.forEach(session => {
      map.set(session.id, session);
    });
    return map;
  }, [allSessions]);

  const matchesBySession = useMemo(() => {
    if (matchesWithPendingChanges === null) return {};

    const grouped = matchesWithPendingChanges.reduce((acc: Record<string, MatchGroup>, match) => {
      const sessionId = match.session_id;

      if (sessionId != null) {
        const key = `session-${sessionId}`;
        if (!acc[key]) {
          // Get session data from allSessions if available, otherwise use match data
          const sessionData = sessionsMap.get(sessionId);
          const sessionCreatedAt = sessionData?.created_at || match.session_created_at;
          const sessionName = sessionData?.name || match.session_name;
          const sessionStatus = sessionData?.status || match.session_status;
          const sessionDate = sessionData?.date || match.date;

          acc[key] = createSessionGroup(
            sessionId,
            sessionName ?? '',
            sessionStatus ?? '',
            sessionCreatedAt ?? null,
            match.session_updated_at ?? null,
            match.session_created_by ?? null,
            match.session_updated_by ?? null,
            sessionDate ?? null
          );
        }
        acc[key].matches.push(match);

        // acc[key] is always a session group here (sessionId != null branch)
        const sessionGroup = acc[key] as ReturnType<typeof createSessionGroup>;
        const status = match.session_status;
        if (status) {
          sessionGroup.status = status;
          sessionGroup.isActive = status === 'ACTIVE';
        }
        if (match.session_updated_by) {
          sessionGroup.updatedBy = match.session_updated_by;
        }
        if (match.session_updated_at) {
          sessionGroup.updatedAt = match.session_updated_at;
          sessionGroup.lastUpdated = match.session_updated_at;
        }
      } else {
        const key = `date-${match.date}`;
        if (!acc[key]) {
          acc[key] = {
            type: 'date',
            name: match.date,
            createdAt: null,
            lastUpdated: null,
            createdBy: null,
            updatedBy: null,
            matches: []
          };
        }
        acc[key].matches.push(match);
      }
      return acc;
    }, {});

    editingSessions.forEach(sessionId => {
      const key = `session-${sessionId}`;
      if (!grouped[key]) {
        const sessionMetadata = editingSessionMetadata.get(sessionId);
        if (sessionMetadata) {
          // Use session data from allSessions if available
          const sessionData = sessionsMap.get(sessionId);
          const sessionCreatedAt = sessionData?.created_at || sessionMetadata.createdAt;
          const sessionDate = sessionData?.date || null;

          grouped[key] = createSessionGroup(
            sessionId,
            sessionMetadata.name || `Session ${sessionId}`,
            sessionMetadata.status || 'SUBMITTED',
            sessionCreatedAt ?? null,
            sessionMetadata.updatedAt ?? null,
            sessionMetadata.createdBy ?? null,
            sessionMetadata.updatedBy ?? null,
            sessionDate
          );
        } else {
          const sessionMatch = matches?.find(m => m.session_id === sessionId);
          if (sessionMatch) {
            // Use session data from allSessions if available
            const sessionData = sessionsMap.get(sessionId);
            const sessionCreatedAt = sessionData?.created_at || sessionMatch.session_created_at;
            const sessionDate = sessionData?.date || sessionMatch.date;

            grouped[key] = createSessionGroup(
              sessionId,
              sessionMatch.session_name || `Session ${sessionId}`,
              sessionMatch.session_status || 'SUBMITTED',
              sessionCreatedAt ?? null,
              sessionMatch.session_updated_at ?? null,
              sessionMatch.session_created_by ?? null,
              sessionMatch.session_updated_by ?? null,
              sessionDate ?? null
            );
          }
        }
      }
    });
    return grouped;
  }, [matchesWithPendingChanges, editingSessions, editingSessionMetadata, matches, sessionsMap]);

  const activeSessionMatches = useMemo(() => {
    if (!activeSession) return [];
    
    // If we have an override (matches from the session's season), use those
    if (activeSessionMatchesOverride) {
      return activeSessionMatchesOverride.filter(match => match.session_id === activeSession.id);
    }

    // Otherwise, get matches from the current matches list
    if (!matchesWithPendingChanges) return [];

    return matchesWithPendingChanges.filter(match => match.session_id === activeSession.id);
  }, [activeSession, matchesWithPendingChanges, activeSessionMatchesOverride]);

  const playerCount = useMemo(() => {
    const players = new Set();
    activeSessionMatches.forEach(match => {
      if (match.team_1_player_1) players.add(match.team_1_player_1);
      if (match.team_1_player_2) players.add(match.team_1_player_2);
      if (match.team_2_player_1) players.add(match.team_2_player_1);
      if (match.team_2_player_2) players.add(match.team_2_player_2);
    });
    return players.size;
  }, [activeSessionMatches]);

  const sessionGroups: [string, MatchGroup][] = useMemo(() => {
    return Object.entries(matchesBySession).sort(([, groupA], [, groupB]) =>
      compareSessionGroups(
        { date: (groupA as ReturnType<typeof createSessionGroup>).date, createdAt: groupA.createdAt },
        { date: (groupB as ReturnType<typeof createSessionGroup>).date, createdAt: groupB.createdAt }
      )
    );
  }, [matchesBySession]);

  const isDataReady = !loading && matches !== null && Array.isArray(matches) && 
                      matchesWithPendingChanges !== null && Array.isArray(matchesWithPendingChanges);
  // Show add match card when data is ready (even for empty/old seasons) and there's no active session
  const showAddMatchCard = isDataReady && !activeSession;
  
  const shouldShowEmptyState = useMemo(() => {
    return showAddMatchCard &&
           !matches?.length &&
           !matchesWithPendingChanges?.length &&
           !sessionGroups?.length &&
           !activeSession;
  }, [showAddMatchCard, matches, matchesWithPendingChanges, sessionGroups, activeSession]);

  if (loading || matches === null) {
    return <MatchesTableSkeleton isLeagueMember={true} />;
  }

  // Handle non-member access - show forbidden message
  if (!isLeagueMember) {
    return (
      <div className="matches-container">
        <div className="league-error">
          <div className="league-message error">
            <h2>Access Denied</h2>
            <p>You don&apos;t have access to view matches for this league. Please contact a league administrator to be added as a member.</p>
          </div>
        </div>
      </div>
    );
  }

  Object.values(matchesBySession).forEach(group => {
    if (group.matches?.length > 0) {
      group.matches = [...group.matches].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }
  });

  const handleAddMatch = async (matchData: Record<string, unknown>, matchId?: number | string) => {
    if (matchId) {
      const match = matchesWithPendingChanges?.find(m => m.id === matchId);
      const sessionId = match?.session_id;
      const isEditingSession = sessionId && editingSessions.has(sessionId);
      
      await onUpdateMatch?.(matchId as number, matchData, isEditingSession ? sessionId : undefined);
    } else {
      const matchPayload = { ...matchData };
      // Preserve season_id if it's in matchData (from AddMatchModal)
      const editingSessionId = editingSessions.size > 0 ? Array.from(editingSessions)[0] : null;

      if (editingSessionId) {
        matchPayload.session_id = editingSessionId;
      } else if (activeSession) {
        matchPayload.session_id = activeSession.id;
      } else if (leagueId) {
        matchPayload.league_id = leagueId;
        // season_id should already be in matchData from AddMatchModal, but ensure it's preserved
      } else {
        throw new Error('leagueId is required to create a match');
      }

      if (editingSessionId) {
        await onCreateMatch?.(matchPayload, editingSessionId);
      } else {
        await onCreateMatch?.(matchPayload);
        if (onCreateSession) {
          await onCreateSession();
        }
      }
    }
  };

  const handleEditMatch = (match: DisplayMatch | Match) => {
    openModal(MODAL_TYPES.ADD_MATCH, {
      editMatch: match,
      onSubmit: handleAddMatch,
      onDelete: onDeleteMatch,
      allPlayerNames,
      leagueMatchOnly: !!leagueId,
      defaultLeagueId: leagueId,
      members,
      league,
      sessionSeasonId: (match as DisplayMatch).session_season_id ?? null,
      defaultSeasonId: selectedSeasonId,
      onSeasonChange: onSeasonChange,
      leagueHomeCourts,
      isFirstMatch: false,
    });
  };

  const handleLockInSession = async (sessionId: number | string) => {
    if (sessionId) {
      await onEndSession?.(sessionId as number);
    }
  };
  
  return (
    <div className="matches-container">
      {showAddMatchCard && !activeSession && (
        <div className="add-matches-section">
          <button 
            className="add-matches-card"
            data-testid="add-matches-card"
            onClick={() => openModal(MODAL_TYPES.ADD_MATCH, {
              onSubmit: handleAddMatch,
              onDelete: onDeleteMatch,
              allPlayerNames,
              leagueMatchOnly: !!leagueId,
              defaultLeagueId: leagueId,
              members,
              league,
              defaultSeasonId: selectedSeasonId,
              onSeasonChange: onSeasonChange,
              leagueHomeCourts,
              isFirstMatch: true,
            })}
          >
            <h2 className="add-matches-title">Add Games</h2>
            <div className="add-matches-icon">
              <Plus size={24} />
            </div>
            <p className="add-matches-description">
              Click to log a new game.
            </p>
          </button>
          
          {/* Photo Upload Button - Show for all league members */}
          {leagueId && (
            <button 
              className="add-matches-card upload-photo-card"
              data-testid="upload-photo-card"
              onClick={() => openModal(MODAL_TYPES.UPLOAD_PHOTO, {
                leagueId,
                seasonId: selectedSeasonId,
                onProceedToReview: handleProceedToPhotoReview
              })}
            >
              <h2 className="add-matches-title">Upload Photo</h2>
              <div className="add-matches-icon">
                <Camera size={24} />
              </div>
              <p className="add-matches-description">
                AI reads scores from photo.
              </p>
            </button>
          )}
        </div>
      )}

      {shouldShowEmptyState && (
        <div className="add-matches-empty-state">
          <p>No matches yet. Click Add Games above to create a session and add your first match!</p>
        </div>
      )}

      {activeSession && (
        <div data-session-id={activeSession.id} data-testid="active-session">
          <ActiveSessionPanel
            activeSession={activeSession}
            activeSessionMatches={activeSessionMatches}
            onPlayerClick={onPlayerClick as (playerId: number | null, playerName: string, e: React.MouseEvent) => void}
            contentVariant={contentVariant}
            isAdmin={isAdmin}
            onAddMatchClick={() => openModal(MODAL_TYPES.ADD_MATCH, {
              onSubmit: handleAddMatch,
              onDelete: onDeleteMatch,
              allPlayerNames,
              leagueMatchOnly: !!leagueId,
              defaultLeagueId: leagueId,
              members,
              league,
              sessionId: activeSession?.id,
              sessionSeasonId: activeSession?.season_id,
              defaultSeasonId: selectedSeasonId,
              onSeasonChange: onSeasonChange,
              leagueHomeCourts,
              isFirstMatch: activeSessionMatches.length === 0,
            })}
            onEditMatch={handleEditMatch}
            onRequestDeleteSession={() => {
              const sessionSeasonId = activeSession?.season_id;
              const sessionSeason = sessionSeasonId && seasons.length > 0
                ? seasons.find(s => s.id === sessionSeasonId)
                : null;
              openModal(MODAL_TYPES.CONFIRMATION, {
                title: 'Delete Session',
                message: `This will delete the session and all ${activeSessionMatches.length} game${activeSessionMatches.length === 1 ? '' : 's'} forever. This cannot be undone.`,
                confirmText: 'Delete Session',
                confirmButtonClass: 'danger',
                sessionName: activeSession?.name,
                season: sessionSeason,
                onConfirm: () => onDeleteSession?.(activeSession.id),
              });
            }}
            onSubmitClick={() => {
            // Get season for the active session
            const sessionSeasonId = activeSession?.season_id;
            const sessionSeason = sessionSeasonId && seasons.length > 0 
              ? seasons.find(s => s.id === sessionSeasonId) 
              : null;
            
            openModal(MODAL_TYPES.CONFIRMATION, {
              title: "Submit Scores",
              message: "Are you sure you want to submit these scores? Once submitted, games will be locked in and only league admins will be able to edit.",
              confirmText: "Submit Scores",
              cancelText: "Cancel",
              onConfirm: () => handleLockInSession(activeSession.id),
              gameCount: activeSessionMatches.length,
              playerCount: playerCount,
              matches: activeSessionMatches,
              season: sessionSeason
            });
          }}
          onStatsClick={() => {
            // Get season for the active session
            const sessionSeasonId = activeSession?.season_id;
            const sessionSeason = sessionSeasonId && seasons.length > 0 
              ? seasons.find(s => s.id === sessionSeasonId) 
              : null;
            
            openModal(MODAL_TYPES.SESSION_SUMMARY, {
              title: activeSession?.name || "Session Summary",
              gameCount: activeSessionMatches.length,
              playerCount: playerCount,
              matches: activeSessionMatches,
              season: sessionSeason
            });
          }}
            onDeleteSession={onDeleteSession ? () => onDeleteSession(activeSession.id) : undefined}
            onUpdateSessionSeason={onUpdateSessionSeason}
            onUpdateSessionCourt={onUpdateSessionCourt}
            leagueHomeCourts={leagueHomeCourts}
            leagueLocationId={league?.location_id}
            seasons={seasons}
            selectedSeasonId={selectedSeasonId}
          />
        </div>
      )}

      {sessionGroups
        .filter(([key, group]) => {
          return !(activeSession && group.type === 'session' && group.id === activeSession.id);
        })
        .map(([key, group]) => {
          const isEditing = group.type === 'session' && editingSessions.has(group.id as number);
          const canEdit = isAdmin && group.type === 'session' && 
                         (group.status === 'SUBMITTED' || group.status === 'EDITED') && 
                         !isEditing;
          
          if (isEditing && group.type === 'session') {
            // Get season_id from the first match in the group, or from session metadata
            const sessionMatch = group.matches && group.matches.length > 0 ? group.matches[0] : null;
            const seasonId = sessionMatch?.session_season_id || null;
            const sessionData = sessionsMap.get(group.id as number);
            return (
              <div data-session-id={group.id} key={key}>
                <ActiveSessionPanel
                  activeSession={{
                    id: group.id as number,
                    name: group.name,
                    season_id: seasonId,
                    court_id: sessionData?.court_id ?? null,
                    court_name: sessionData?.court_name ?? null,
                    court_slug: sessionData?.court_slug ?? null,
                  }}
                  activeSessionMatches={group.matches}
                  onPlayerClick={onPlayerClick as (playerId: number | null, playerName: string, e: React.MouseEvent) => void}
                  contentVariant={contentVariant}
                  isAdmin={isAdmin}
                  onAddMatchClick={() => openModal(MODAL_TYPES.ADD_MATCH, {
                    onSubmit: handleAddMatch,
                    onDelete: onDeleteMatch,
                    allPlayerNames,
                    leagueMatchOnly: !!leagueId,
                    defaultLeagueId: leagueId,
                    members,
                    league,
                    sessionId: group.id,
                    sessionSeasonId: seasonId,
                    defaultSeasonId: selectedSeasonId,
                    onSeasonChange: onSeasonChange,
                    leagueHomeCourts,
                    isFirstMatch: false,
                  })}
                  onEditMatch={handleEditMatch}
                  onSaveClick={() => onSaveEditedSession?.(group.id as number)}
                  onCancelClick={() => onCancelEdit?.(group.id as number)}
                  onDeleteSession={onDeleteSession ? () => onDeleteSession(group.id as number) : undefined}
                  onRequestDeleteSession={() => {
                    const seasonId = group.matches?.[0]?.session_season_id;
                    const sessionSeasonForDelete = seasonId && seasons.length > 0
                      ? seasons.find(s => s.id === seasonId)
                      : null;
                    openModal(MODAL_TYPES.CONFIRMATION, {
                      title: 'Delete Session',
                      message: `This will delete the session and all ${group.matches?.length ?? 0} game${(group.matches?.length ?? 0) === 1 ? '' : 's'} forever. This cannot be undone.`,
                      confirmText: 'Delete Session',
                      confirmButtonClass: 'danger',
                      sessionName: group.name,
                      season: sessionSeasonForDelete,
                      onConfirm: () => onDeleteSession?.(group.id as number),
                    });
                  }}
                  onUpdateSessionSeason={onUpdateSessionSeason}
                  onUpdateSessionCourt={onUpdateSessionCourt}
                  leagueHomeCourts={leagueHomeCourts}
                  onStatsClick={() => {
                  // Get season for this session
                  const sessionMatch = group.matches && group.matches.length > 0 ? group.matches[0] : null;
                  const seasonId = sessionMatch?.session_season_id;
                  const sessionSeason = seasonId && seasons.length > 0
                    ? seasons.find(s => s.id === seasonId)
                    : null;

                  const sessionGameCount = group.matches?.length || 0;
                  const sessionPlayers = new Set();
                  group.matches?.forEach((match: DisplayMatch) => {
                    if (match.team_1_player_1) sessionPlayers.add(match.team_1_player_1);
                    if (match.team_1_player_2) sessionPlayers.add(match.team_1_player_2);
                    if (match.team_2_player_1) sessionPlayers.add(match.team_2_player_1);
                    if (match.team_2_player_2) sessionPlayers.add(match.team_2_player_2);
                  });
                  const sessionPlayerCount = sessionPlayers.size;

                  openModal(MODAL_TYPES.SESSION_SUMMARY, {
                    title: group.name || "Session Summary",
                    gameCount: sessionGameCount,
                    playerCount: sessionPlayerCount,
                    matches: group.matches,
                    season: sessionSeason
                  });
                }}
                  isEditing={true}
                  leagueLocationId={league?.location_id}
                  seasons={seasons}
                  selectedSeasonId={selectedSeasonId}
                />
              </div>
            );
          }

          // Calculate stats for this session group
          const sessionGameCount = group.matches?.length || 0;
          const sessionPlayers = new Set();
          group.matches?.forEach((match: DisplayMatch) => {
            if (match.team_1_player_1) sessionPlayers.add(match.team_1_player_1);
            if (match.team_1_player_2) sessionPlayers.add(match.team_1_player_2);
            if (match.team_2_player_1) sessionPlayers.add(match.team_2_player_1);
            if (match.team_2_player_2) sessionPlayers.add(match.team_2_player_2);
          });
          const sessionPlayerCount = sessionPlayers.size;

          // Get season for this session group
          const sessionMatch = group.matches && group.matches.length > 0 ? group.matches[0] : null;
          const seasonId = sessionMatch?.session_season_id;
          const sessionSeason = seasonId && seasons.length > 0 
            ? seasons.find(s => s.id === seasonId) 
            : null;
          
          const timestampText = group.lastUpdated ? (() => {
            const timestamp = formatRelativeTime(group.lastUpdated);
            if (group.type === 'session') {
              const user = group.updatedBy || group.createdBy;
              if (group.status === 'EDITED' && user) return `Edited ${timestamp} by ${user}`;
              if (group.status === 'SUBMITTED' && user) return `Submitted ${timestamp} by ${user}`;
            }
            return timestamp;
          })() : null;

          return (
            <div 
              key={key} 
              className="match-date-group"
              data-session-id={group.type === 'session' ? group.id : undefined}
              data-testid="session-group"
            >
              <SessionGroupHeader
                sessionName={group.name ?? ''}
                gameCount={sessionGameCount}
                playerCount={sessionPlayerCount}
                onStatsClick={group.type === 'session' && sessionGameCount > 0 ? () => {
                  openModal(MODAL_TYPES.SESSION_SUMMARY, {
                    title: group.name || "Session Summary",
                    gameCount: sessionGameCount,
                    playerCount: sessionPlayerCount,
                    matches: group.matches,
                    season: sessionSeason
                  });
                } : undefined}
                onEditClick={canEdit ? () => onEnterEditMode?.(group.id as number) : undefined}
                timestampText={contentVariant === 'cards' ? (timestampText ?? undefined) : undefined}
                seasonBadge={sessionSeason ? (sessionSeason.name || `Season ${sessionSeason.id}`) : undefined}
              />
              {contentVariant === 'clipboard' ? (
                <SessionMatchesClipboardTable
                  matches={group.matches}
                  onPlayerClick={onPlayerClick}
                  onEditMatch={handleEditMatch}
                  canAddMatch={false}
                  showActions={false}
                  lastUpdated={group.lastUpdated}
                  formatRelativeTime={(date) => {
                    const timestamp = formatRelativeTime(date) ?? '';
                    if (group.type === 'session') {
                      const user = group.updatedBy || group.createdBy;
                      if (group.status === 'EDITED' && user) {
                        return `Edited ${timestamp} by ${user}`;
                      }
                      if (group.status === 'SUBMITTED' && user) {
                        return `Submitted ${timestamp} by ${user}`;
                      }
                    }
                    return timestamp;
                  }}
                />
              ) : (
                <div className="match-cards">
                  {group.matches.map((match: DisplayMatch) => (
                    <MatchCard
                      key={match.id}
                      match={match}
                      onPlayerClick={onPlayerClick}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
