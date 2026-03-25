import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trophy, Users, ChevronDown, Camera } from 'lucide-react';
import type { Season, Match } from '../../types';

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
  onCreateSession?: (...args: unknown[]) => void;
  onEndSession?: (...args: unknown[]) => void;
  onDeleteSession?: (...args: unknown[]) => void;
  onCreateMatch?: (...args: unknown[]) => void;
  onUpdateMatch?: (...args: unknown[]) => void;
  onDeleteMatch?: (...args: unknown[]) => void;
  allPlayerNames?: string[];
  playerIdToName?: Map<number, string>;
  leagueId?: number | null;
  isAdmin?: boolean;
  editingSessions?: Set<number>;
  onEnterEditMode?: (...args: unknown[]) => void;
  onSaveEditedSession?: (...args: unknown[]) => void;
  onCancelEdit?: (...args: unknown[]) => void;
  pendingMatchChanges?: Map<number, SessionChanges>;
  editingSessionMetadata?: Map<number, SessionMetadata>;
  seasons?: Season[];
  selectedSeasonId?: number | null;
  onUpdateSessionSeason?: ((...args: unknown[]) => void) | null;
  onUpdateSessionCourt?: ((...args: unknown[]) => void) | null;
  leagueHomeCourts?: HomeCourt[];
  activeSessionMatchesOverride?: DisplayMatch[] | null;
  activeSeasons?: Season[];
  onSeasonChange?: ((...args: unknown[]) => void) | null;
  onRefreshData?: ((...args: unknown[]) => void) | null;
  contentVariant?: string;
}

/** Partial session shape (only what MatchesTable uses) */
interface Session {
  id: number;
  name?: string | null;
  status?: string | null;
  season_id?: number | null;
  date?: string | null;
  created_at?: string | null;
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
  playerIdToName = new Map(),
  leagueId = null,
  isAdmin = false,
  editingSessions = new Set(),
  onEnterEditMode,
  onSaveEditedSession,
  onCancelEdit,
  pendingMatchChanges = new Map(),
  editingSessionMetadata = new Map(),
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
  const hasRenderedMatchesRef = useRef(false);
  
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
          const team1Score = updatedData.team1_score !== undefined ? updatedData.team1_score : match['Team 1 Score'];
          const team2Score = updatedData.team2_score !== undefined ? updatedData.team2_score : match['Team 2 Score'];
          
          updatedMatches[matchIndex] = {
            ...match,
            'Team 1 Player 1': (updatedData.team1_player1 as string | undefined) || match['Team 1 Player 1'],
            'Team 1 Player 2': (updatedData.team1_player2 as string | undefined) || match['Team 1 Player 2'],
            'Team 2 Player 1': (updatedData.team2_player1 as string | undefined) || match['Team 2 Player 1'],
            'Team 2 Player 2': (updatedData.team2_player2 as string | undefined) || match['Team 2 Player 2'],
            'Team 1 Score': team1Score as number | null,
            'Team 2 Score': team2Score as number | null,
            Winner: calculateWinner(team1Score as number, team2Score as number)
          };
        }
      });

      sessionChanges.additions.forEach((newMatchData: Record<string, unknown>, index: number) => {
        const sessionMatch = updatedMatches.find(m => m['Session ID'] === sessionId);
        const sessionName = sessionMatch?.['Session Name'] || 'New Session';
        
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
          'Session ID': sessionId,
          'Session Name': sessionName as string | null,
          'Session Status': 'ACTIVE',
          'Team 1 Player 1': getPlayerName((newMatchData.team1_player1_id || newMatchData.team1_player1) as string | number | null | undefined),
          'Team 1 Player 2': getPlayerName((newMatchData.team1_player2_id || newMatchData.team1_player2) as string | number | null | undefined),
          'Team 2 Player 1': getPlayerName((newMatchData.team2_player1_id || newMatchData.team2_player1) as string | number | null | undefined),
          'Team 2 Player 2': getPlayerName((newMatchData.team2_player2_id || newMatchData.team2_player2) as string | number | null | undefined),
          'Team 1 Score': newMatchData.team1_score as number | null,
          'Team 2 Score': newMatchData.team2_score as number | null,
          Winner: calculateWinner(newMatchData.team1_score as number, newMatchData.team2_score as number),
          'Team 1 ELO Change': 0,
          'Team 2 ELO Change': 0,
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
      const sessionId = match['Session ID'];
      
      if (sessionId != null) {
        const key = `session-${sessionId}`;
        if (!acc[key]) {
          // Get session data from allSessions if available, otherwise use match data
          const sessionData = sessionsMap.get(sessionId);
          const sessionCreatedAt = sessionData?.created_at || match['Session Created At'];
          const sessionName = sessionData?.name || match['Session Name'];
          const sessionStatus = sessionData?.status || match['Session Status'];
          const sessionDate = sessionData?.date || match.Date;

          acc[key] = createSessionGroup(
            sessionId,
            sessionName,
            sessionStatus,
            sessionCreatedAt,
            match['Session Updated At'],
            match['Session Created By'],
            match['Session Updated By'],
            sessionDate
          );
        }
        acc[key].matches.push(match);

        // acc[key] is always a session group here (sessionId != null branch)
        const sessionGroup = acc[key] as ReturnType<typeof createSessionGroup>;
        const status = match['Session Status'];
        if (status) {
          sessionGroup.status = status;
          sessionGroup.isActive = status === 'ACTIVE';
        }
        if (match['Session Updated By']) {
          sessionGroup.updatedBy = match['Session Updated By'];
        }
        if (match['Session Updated At']) {
          sessionGroup.updatedAt = match['Session Updated At'];
          sessionGroup.lastUpdated = match['Session Updated At'];
        }
      } else {
        const key = `date-${match.Date}`;
        if (!acc[key]) {
          acc[key] = {
            type: 'date',
            name: match.Date,
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
            sessionCreatedAt,
            sessionMetadata.updatedAt,
            sessionMetadata.createdBy,
            sessionMetadata.updatedBy,
            sessionDate
          );
        } else {
          const sessionMatch = matches?.find(m => m['Session ID'] === sessionId);
          if (sessionMatch) {
            // Use session data from allSessions if available
            const sessionData = sessionsMap.get(sessionId);
            const sessionCreatedAt = sessionData?.created_at || sessionMatch['Session Created At'];
            const sessionDate = sessionData?.date || sessionMatch.Date;

            grouped[key] = createSessionGroup(
              sessionId,
              sessionMatch['Session Name'] || `Session ${sessionId}`,
              sessionMatch['Session Status'] || 'SUBMITTED',
              sessionCreatedAt,
              sessionMatch['Session Updated At'],
              sessionMatch['Session Created By'],
              sessionMatch['Session Updated By'],
              sessionDate
            );
          }
        }
      }
    });
    return grouped;
  }, [matchesWithPendingChanges, editingSessions, editingSessionMetadata, matches, sessionsMap]);

  useEffect(() => {
    if (!loading && matches !== null && Array.isArray(matches) && matchesWithPendingChanges !== null) {
      hasRenderedMatchesRef.current = true;
    } else if (loading || matches === null) {
      hasRenderedMatchesRef.current = false;
    }
  }, [loading, matches, matchesWithPendingChanges]);

  const activeSessionMatches = useMemo(() => {
    if (!activeSession) return [];
    
    // If we have an override (matches from the session's season), use those
    if (activeSessionMatchesOverride) {
      return activeSessionMatchesOverride.filter(match => match['Session ID'] === activeSession.id);
    }
    
    // Otherwise, get matches from the current matches list
    if (!matchesWithPendingChanges) return [];
    
    return matchesWithPendingChanges.filter(match => match['Session ID'] === activeSession.id);
  }, [activeSession, matchesWithPendingChanges, activeSessionMatchesOverride]);

  const playerCount = useMemo(() => {
    const players = new Set();
    activeSessionMatches.forEach(match => {
      if (match['Team 1 Player 1']) players.add(match['Team 1 Player 1']);
      if (match['Team 1 Player 2']) players.add(match['Team 1 Player 2']);
      if (match['Team 2 Player 1']) players.add(match['Team 2 Player 1']);
      if (match['Team 2 Player 2']) players.add(match['Team 2 Player 2']);
    });
    return players.size;
  }, [activeSessionMatches]);

  const sessionGroups: [string, MatchGroup][] = useMemo(() => {
    return Object.entries(matchesBySession).sort(([, groupA], [, groupB]) => {
      // Primary sort: session date descending (matches backend ORDER BY date DESC)
      // Session date is a YYYY-MM-DD string — lexicographic comparison works correctly
      const sessionDateA = (groupA as ReturnType<typeof createSessionGroup>).date || groupA.name;
      const sessionDateB = (groupB as ReturnType<typeof createSessionGroup>).date || groupB.name;

      if (sessionDateA && sessionDateB) {
        const dateCmp = sessionDateB.localeCompare(sessionDateA);
        if (dateCmp !== 0) return dateCmp;
      }

      // Tiebreaker: created_at descending (matches backend ORDER BY created_at DESC)
      const createdA = groupA.createdAt;
      const createdB = groupB.createdAt;

      if (createdA && createdB) {
        const timeDiff = new Date(createdB).getTime() - new Date(createdA).getTime();
        if (timeDiff !== 0) return timeDiff;
      }

      if (createdA && !createdB) return -1;
      if (!createdA && createdB) return 1;

      return 0;
    });
  }, [matchesBySession]);

  const isDataReady = !loading && matches !== null && Array.isArray(matches) && 
                      matchesWithPendingChanges !== null && Array.isArray(matchesWithPendingChanges);
  // Show add match card when data is ready (even for empty/old seasons) and there's no active session
  const showAddMatchCard = isDataReady && !activeSession;
  
  const shouldShowEmptyState = useMemo(() => {
    return showAddMatchCard && 
           hasRenderedMatchesRef.current && 
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
      group.matches.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
    }
  });

  const handleAddMatch = async (matchData: Record<string, unknown>, matchId?: number | string) => {
    if (matchId) {
      const match = matchesWithPendingChanges.find(m => m.id === matchId);
      const sessionId = match?.['Session ID'];
      const isEditingSession = sessionId && editingSessions.has(sessionId);
      
      await onUpdateMatch(matchId, matchData, isEditingSession ? sessionId : undefined);
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
        await onCreateMatch(matchPayload, editingSessionId);
      } else {
        await onCreateMatch(matchPayload);
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
      sessionSeasonId: ('Session Season ID' in match ? (match as DisplayMatch)['Session Season ID'] : match.session_season_id) ?? null,
      defaultSeasonId: selectedSeasonId,
      onSeasonChange: onSeasonChange
    });
  };

  const handleLockInSession = async (sessionId: number | string) => {
    if (sessionId) {
      await onEndSession(sessionId);
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
              onSeasonChange: onSeasonChange
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
            onPlayerClick={onPlayerClick}
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
              onSeasonChange: onSeasonChange
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
                onConfirm: () => onDeleteSession(activeSession.id),
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
            onDeleteSession={onDeleteSession}
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
            const seasonId = sessionMatch?.['Session Season ID'] || null;
            return (
              <div data-session-id={group.id} key={key}>
                <ActiveSessionPanel
                  activeSession={{ id: group.id as number, name: group.name, season_id: seasonId }}
                  activeSessionMatches={group.matches}
                  onPlayerClick={onPlayerClick}
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
                    onSeasonChange: onSeasonChange
                  })}
                  onEditMatch={handleEditMatch}
                  onSaveClick={() => onSaveEditedSession(group.id)}
                  onCancelClick={() => onCancelEdit(group.id)}
                  onDeleteSession={onDeleteSession}
                  onRequestDeleteSession={() => {
                    const seasonId = group.matches?.[0]?.['Session Season ID'];
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
                      onConfirm: () => onDeleteSession(group.id),
                    });
                  }}
                  onUpdateSessionSeason={onUpdateSessionSeason}
                  onUpdateSessionCourt={onUpdateSessionCourt}
                  leagueHomeCourts={leagueHomeCourts}
                  onStatsClick={() => {
                  // Get season for this session
                  const sessionMatch = group.matches && group.matches.length > 0 ? group.matches[0] : null;
                  const seasonId = sessionMatch?.['Session Season ID'];
                  const sessionSeason = seasonId && seasons.length > 0
                    ? seasons.find(s => s.id === seasonId)
                    : null;

                  const sessionGameCount = group.matches?.length || 0;
                  const sessionPlayers = new Set();
                  group.matches?.forEach((match: Record<string, unknown>) => {
                    if (match['Team 1 Player 1']) sessionPlayers.add(match['Team 1 Player 1']);
                    if (match['Team 1 Player 2']) sessionPlayers.add(match['Team 1 Player 2']);
                    if (match['Team 2 Player 1']) sessionPlayers.add(match['Team 2 Player 1']);
                    if (match['Team 2 Player 2']) sessionPlayers.add(match['Team 2 Player 2']);
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
          group.matches?.forEach((match: Record<string, unknown>) => {
            if (match['Team 1 Player 1']) sessionPlayers.add(match['Team 1 Player 1']);
            if (match['Team 1 Player 2']) sessionPlayers.add(match['Team 1 Player 2']);
            if (match['Team 2 Player 1']) sessionPlayers.add(match['Team 2 Player 1']);
            if (match['Team 2 Player 2']) sessionPlayers.add(match['Team 2 Player 2']);
          });
          const sessionPlayerCount = sessionPlayers.size;
          
          // Get season for this session group
          const sessionMatch = group.matches && group.matches.length > 0 ? group.matches[0] : null;
          const seasonId = sessionMatch?.['Session Season ID'];
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
                sessionName={group.name}
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
                onEditClick={canEdit ? () => onEnterEditMode(group.id) : undefined}
                timestampText={contentVariant === 'cards' ? timestampText : undefined}
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
                    const timestamp = formatRelativeTime(date);
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
                  {group.matches.map((match: DisplayMatch, idx: number) => (
                    <MatchCard
                      key={idx}
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
