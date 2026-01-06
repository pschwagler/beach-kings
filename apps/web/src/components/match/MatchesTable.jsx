import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Edit2, Trophy, Users, ChevronDown } from 'lucide-react';
import MatchCard from './MatchCard';

import ActiveSessionPanel from '../session/ActiveSessionPanel';
import { MatchesTableSkeleton } from '../ui/Skeletons';
import { useLeague } from '../../contexts/LeagueContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { formatRelativeTime } from '../../utils/dateUtils';

function calculateWinner(team1Score, team2Score) {
  if (team1Score > team2Score) return 'Team 1';
  if (team1Score < team2Score) return 'Team 2';
  return 'Tie';
}

function createSessionGroup(sessionId, sessionName, sessionStatus, sessionCreatedAt, sessionUpdatedAt, sessionCreatedBy, sessionUpdatedBy) {
  return {
    type: 'session',
    id: sessionId,
    name: sessionName,
    status: sessionStatus,
    isActive: sessionStatus === 'ACTIVE',
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
  activeSessionMatchesOverride = null,
  activeSeasons = [],
  sessionToScrollRef = null,
  onSeasonChange = null
}) {
  const { isLeagueMember, members, league } = useLeague();
  const { openModal } = useModal();
  const hasRenderedMatchesRef = useRef(false);

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

    const grouped = matchesWithPendingChanges.reduce((acc, match) => {
      const sessionId = match['Session ID'];
      
      if (sessionId != null) {
        const key = `session-${sessionId}`;
        if (!acc[key]) {
          // Get session data from allSessions if available, otherwise use match data
          const sessionData = sessionsMap.get(sessionId);
          const sessionCreatedAt = sessionData?.created_at || match['Session Created At'];
          const sessionName = sessionData?.name || match['Session Name'];
          const sessionStatus = sessionData?.status || match['Session Status'];
          
          acc[key] = createSessionGroup(
            sessionId,
            sessionName,
            sessionStatus,
            sessionCreatedAt,
            match['Session Updated At'],
            match['Session Created By'],
            match['Session Updated By']
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
          
          grouped[key] = createSessionGroup(
            sessionId,
            sessionMetadata.name || `Session ${sessionId}`,
            sessionMetadata.status || 'SUBMITTED',
            sessionCreatedAt,
            sessionMetadata.updatedAt,
            sessionMetadata.createdBy,
            sessionMetadata.updatedBy
          );
        } else {
          const sessionMatch = matches?.find(m => m['Session ID'] === sessionId);
          if (sessionMatch) {
            // Use session data from allSessions if available
            const sessionData = sessionsMap.get(sessionId);
            const sessionCreatedAt = sessionData?.created_at || sessionMatch['Session Created At'];
            
            grouped[key] = createSessionGroup(
              sessionId,
              sessionMatch['Session Name'] || `Session ${sessionId}`,
              sessionMatch['Session Status'] || 'SUBMITTED',
              sessionCreatedAt,
              sessionMatch['Session Updated At'],
              sessionMatch['Session Created By'],
              sessionMatch['Session Updated By']
            );
          }
        }
      }
    });
    return grouped;
  }, [matchesWithPendingChanges, Array.from(editingSessions).join(','), Array.from(editingSessionMetadata.keys()).join(','), matches, sessionsMap]);

  useEffect(() => {
    if (!loading && matches !== null && Array.isArray(matches) && matchesWithPendingChanges !== null) {
      hasRenderedMatchesRef.current = true;
    } else if (loading || matches === null) {
      hasRenderedMatchesRef.current = false;
    }
  }, [loading, matches, matchesWithPendingChanges]);

  // Scroll session into view when sessionToScrollRef changes
  useEffect(() => {
    if (sessionToScrollRef?.current) {
      const sessionId = sessionToScrollRef.current;
      // Clear the ref so we don't scroll again on next render
      sessionToScrollRef.current = null;
      
      // Wait for DOM to update after filter change and data to load
      // Use a longer timeout to ensure matches are rendered
      const scrollTimeout = setTimeout(() => {
        // Try to find the session element by data attribute
        const sessionElement = document.querySelector(`[data-session-id="${sessionId}"]`);
        if (sessionElement) {
          sessionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 300);
      
      return () => clearTimeout(scrollTimeout);
    }
  }, [sessionToScrollRef, matchesWithPendingChanges]);

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

  const sessionGroups = useMemo(() => {
    return Object.entries(matchesBySession).sort(([keyA, groupA], [keyB, groupB]) => {
      // Sort by created_at (newest first)
      // Use createdAt if available, otherwise fall back to lastUpdated
      const dateA = groupA.createdAt || groupA.lastUpdated;
      const dateB = groupB.createdAt || groupB.lastUpdated;
      
      if (dateA && dateB) {
        // Compare timestamps directly (newest first = descending order)
        const timeDiff = new Date(dateB) - new Date(dateA);
        if (timeDiff !== 0) {
          return timeDiff;
        }
      }
      
      // If one has a date and the other doesn't, prioritize the one with a date
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      
      // Final fallback to alphabetical (descending)
      return groupB.name.localeCompare(groupA.name);
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
            <p>You don't have access to view matches for this league. Please contact a league administrator to be added as a member.</p>
          </div>
        </div>
      </div>
    );
  }

  Object.values(matchesBySession).forEach(group => {
    if (group.matches?.length > 0) {
      group.matches.sort((a, b) => (b.id || 0) - (a.id || 0));
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
                onUpdateSessionSeason={onUpdateSessionSeason}
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
          
          return (
            <div 
              key={key} 
              className="match-date-group"
              data-session-id={group.type === 'session' ? group.id : undefined}
              data-testid="session-group"
            >
              <h3 className="match-date-header">
                <span className="match-date-header-left">
                  {group.name}
                  {canEdit && (
                    <button
                      className="edit-session-button"
                      onClick={() => onEnterEditMode(group.id)}
                      title="Edit Session"
                      data-testid="edit-session-button"
                    >
                      <Edit2 size={16} />
                    </button>
                  )}
                  {sessionSeason && (
                    <span className="season-badge">
                      {sessionSeason.name || `Season ${sessionSeason.id}`}
                    </span>
                  )}
                </span>
                {group.type === 'session' && sessionGameCount > 0 && (
                  <div 
                    className="session-stats session-stats-clickable match-date-header-stats"
                    onClick={() => {
                      openModal(MODAL_TYPES.SESSION_SUMMARY, {
                        title: group.name || "Session Summary",
                        gameCount: sessionGameCount,
                        playerCount: sessionPlayerCount,
                        matches: group.matches,
                        season: sessionSeason
                      });
                    }}
                  >
                    <div className="session-stat">
                      <Trophy size={16} />
                      {sessionGameCount} {sessionGameCount === 1 ? 'game' : 'games'}
                    </div>
                    <div className="session-stat">
                      <Users size={16} />
                      {sessionPlayerCount} {sessionPlayerCount === 1 ? 'player' : 'players'}
                    </div>
                  </div>
                )}
              </h3>
              <div className="match-cards">
                {group.matches.map((match, idx) => (
                  <MatchCard 
                    key={idx} 
                    match={match} 
                    onPlayerClick={onPlayerClick} 
                  />
                ))}
              </div>
              {group.lastUpdated && (
                <div className="session-timestamp">
                  {(() => {
                    const timestamp = formatRelativeTime(group.lastUpdated);
                    const user = group.updatedBy || group.createdBy;
                    if (group.status === 'EDITED' && user) {
                      return `Edited ${timestamp} by ${user}`;
                    }
                    if (group.status === 'SUBMITTED' && user) {
                      return `Submitted ${timestamp} by ${user}`;
                    }
                    return timestamp;
                  })()}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}
