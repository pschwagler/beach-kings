import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trophy, Users, ChevronDown, Camera } from 'lucide-react';
import MatchCard from './MatchCard';
import SessionMatchesClipboardTable from './SessionMatchesClipboardTable';

interface MatchesTableProps {
  matches: any[];
  onPlayerClick: (playerId: any, playerName: string, e: React.MouseEvent) => void;
  loading?: boolean;
  activeSession?: any;
  allSessions?: any[];
  onCreateSession?: (...args: any[]) => void;
  onEndSession?: (...args: any[]) => void;
  onDeleteSession?: (...args: any[]) => void;
  onCreateMatch?: (...args: any[]) => void;
  onUpdateMatch?: (...args: any[]) => void;
  onDeleteMatch?: (...args: any[]) => void;
  allPlayerNames?: any[];
  playerIdToName?: Map<any, any>;
  leagueId?: number | null;
  isAdmin?: boolean;
  editingSessions?: Set<any>;
  onEnterEditMode?: (...args: any[]) => void;
  onSaveEditedSession?: (...args: any[]) => void;
  onCancelEdit?: (...args: any[]) => void;
  pendingMatchChanges?: Map<any, any>;
  editingSessionMetadata?: Map<any, any>;
  seasons?: any[];
  selectedSeasonId?: number | null;
  onUpdateSessionSeason?: ((...args: any[]) => void) | null;
  onUpdateSessionCourt?: ((...args: any[]) => void) | null;
  leagueHomeCourts?: any[];
  activeSessionMatchesOverride?: any[] | null;
  activeSeasons?: any[];
  onSeasonChange?: ((...args: any[]) => void) | null;
  onRefreshData?: ((...args: any[]) => void) | null;
  contentVariant?: string;
}

import ActiveSessionPanel from '../session/ActiveSessionPanel';
import SessionGroupHeader from '../session/SessionGroupHeader';
import { MatchesTableSkeleton } from '../ui/Skeletons';
import { useLeague } from '../../contexts/LeagueContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { formatRelativeTime } from '../../utils/dateUtils';
import { calculateWinner } from '../league/utils/matchUtils';

function createSessionGroup(sessionId, sessionName, sessionStatus, sessionCreatedAt, sessionUpdatedAt, sessionCreatedBy, sessionUpdatedBy, sessionDate) {
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
    matches: []
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
  const [photoJobId, setPhotoJobId] = useState(null);
  const [photoSessionId, setPhotoSessionId] = useState(null);
  
  const handlePhotoMatchesCreated = useCallback(async (matchIds, photoSeasonId) => {
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
  
  const handleProceedToPhotoReview = useCallback((jobId, sessionId, uploadedImageUrl = null) => {
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
        updatedMatches = updatedMatches.filter(m => !sessionChanges.deletions.includes(m.id));
      }
      
      sessionChanges.updates.forEach((updatedData, matchId) => {
        const matchIndex = updatedMatches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          const match = updatedMatches[matchIndex];
          const team1Score = updatedData.team1_score !== undefined ? updatedData.team1_score : match['Team 1 Score'];
          const team2Score = updatedData.team2_score !== undefined ? updatedData.team2_score : match['Team 2 Score'];
          
          updatedMatches[matchIndex] = {
            ...match,
            'Team 1 Player 1': updatedData.team1_player1 || match['Team 1 Player 1'],
            'Team 1 Player 2': updatedData.team1_player2 || match['Team 1 Player 2'],
            'Team 2 Player 1': updatedData.team2_player1 || match['Team 2 Player 1'],
            'Team 2 Player 2': updatedData.team2_player2 || match['Team 2 Player 2'],
            'Team 1 Score': team1Score,
            'Team 2 Score': team2Score,
            Winner: calculateWinner(team1Score, team2Score)
          };
        }
      });

      sessionChanges.additions.forEach((newMatchData, index) => {
        const sessionMatch = updatedMatches.find(m => m['Session ID'] === sessionId);
        const sessionName = sessionMatch?.['Session Name'] || 'New Session';
        
        // Convert player IDs to names using the reverse map
        // Match data has team1_player1_id, team1_player2_id, etc.
        const getPlayerName = (playerId) => {
          if (!playerId) return '';
          // Handle both ID format (number) and name format (string) for backwards compatibility
          if (typeof playerId === 'string' && !/^\d+$/.test(playerId)) {
            return playerId; // Already a name
          }
          const name = playerIdToName.get(Number(playerId)) || '';
          return name;
        };
        
        const pendingMatch = {
          id: `pending-${sessionId}-${index}`,
          Date: new Date().toISOString().split('T')[0],
          'Session ID': sessionId,
          'Session Name': sessionName,
          'Session Status': 'ACTIVE',
          'Team 1 Player 1': getPlayerName(newMatchData.team1_player1_id || newMatchData.team1_player1),
          'Team 1 Player 2': getPlayerName(newMatchData.team1_player2_id || newMatchData.team1_player2),
          'Team 2 Player 1': getPlayerName(newMatchData.team2_player1_id || newMatchData.team2_player1),
          'Team 2 Player 2': getPlayerName(newMatchData.team2_player2_id || newMatchData.team2_player2),
          'Team 1 Score': newMatchData.team1_score,
          'Team 2 Score': newMatchData.team2_score,
          Winner: calculateWinner(newMatchData.team1_score, newMatchData.team2_score),
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
    const map = new Map();
    allSessions.forEach(session => {
      map.set(session.id, session);
    });
    return map;
  }, [allSessions]);

  const matchesBySession = useMemo(() => {
    if (matchesWithPendingChanges === null) return {};

    const grouped = matchesWithPendingChanges.reduce((acc: Record<string, any>, match) => {
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
        
        const status = match['Session Status'];
        if (status) {
          acc[key].status = status;
          acc[key].isActive = status === 'ACTIVE';
        }
        if (match['Session Updated By']) {
          acc[key].updatedBy = match['Session Updated By'];
        }
        if (match['Session Updated At']) {
          acc[key].updatedAt = match['Session Updated At'];
          acc[key].lastUpdated = match['Session Updated At'];
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

  const sessionGroups: [string, any][] = useMemo(() => {
    return Object.entries(matchesBySession).sort(([keyA, groupA]: [string, any], [keyB, groupB]: [string, any]) => {
      // Primary sort: session date descending (matches backend ORDER BY date DESC)
      // Session date is a YYYY-MM-DD string — lexicographic comparison works correctly
      const sessionDateA = groupA.date || groupA.name;
      const sessionDateB = groupB.date || groupB.name;

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

  (Object.values(matchesBySession) as any[]).forEach(group => {
    if (group.matches?.length > 0) {
      group.matches.sort((a: any, b: any) => (b.id || 0) - (a.id || 0));
    }
  });

  const handleAddMatch = async (matchData, matchId) => {
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

  const handleEditMatch = (match) => {
    openModal(MODAL_TYPES.ADD_MATCH, {
      editMatch: match,
      onSubmit: handleAddMatch,
      onDelete: onDeleteMatch,
      allPlayerNames,
      leagueMatchOnly: !!leagueId,
      defaultLeagueId: leagueId,
      members,
      league,
      sessionSeasonId: match['Session Season ID'] ?? null,
      defaultSeasonId: selectedSeasonId,
      onSeasonChange: onSeasonChange
    });
  };

  const handleLockInSession = async (sessionId) => {
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
          const isEditing = group.type === 'session' && editingSessions.has(group.id);
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
                  activeSession={{ id: group.id, name: group.name, season_id: seasonId }}
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
                  group.matches?.forEach(match => {
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
          group.matches?.forEach(match => {
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
            const user = group.updatedBy || group.createdBy;
            if (group.status === 'EDITED' && user) return `Edited ${timestamp} by ${user}`;
            if (group.status === 'SUBMITTED' && user) return `Submitted ${timestamp} by ${user}`;
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
                    const user = group.updatedBy || group.createdBy;
                    if (group.status === 'EDITED' && user) {
                      return `Edited ${timestamp} by ${user}`;
                    }
                    if (group.status === 'SUBMITTED' && user) {
                      return `Submitted ${timestamp} by ${user}`;
                    }
                    return timestamp;
                  }}
                />
              ) : (
                <div className="match-cards">
                  {group.matches.map((match, idx) => (
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
