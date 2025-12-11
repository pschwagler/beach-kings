import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Edit2 } from 'lucide-react';
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
  onCreateSession, 
  onEndSession,
  onDeleteSession, 
  onCreateMatch,
  onUpdateMatch,
  onDeleteMatch,
  allPlayerNames,
  leagueId = null,
  isAdmin = false,
  editingSessions = new Set(),
  onEnterEditMode,
  onSaveEditedSession,
  onCancelEdit,
  pendingMatchChanges = new Map(),
  editingSessionMetadata = new Map()
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
        
        updatedMatches.push({
          id: `pending-${sessionId}-${index}`,
          Date: new Date().toISOString().split('T')[0],
          'Session ID': sessionId,
          'Session Name': sessionName,
          'Session Status': 'ACTIVE',
          'Team 1 Player 1': newMatchData.team1_player1 || '',
          'Team 1 Player 2': newMatchData.team1_player2 || '',
          'Team 2 Player 1': newMatchData.team2_player1 || '',
          'Team 2 Player 2': newMatchData.team2_player2 || '',
          'Team 1 Score': newMatchData.team1_score,
          'Team 2 Score': newMatchData.team2_score,
          Winner: calculateWinner(newMatchData.team1_score, newMatchData.team2_score),
          'Team 1 ELO Change': 0,
          'Team 2 ELO Change': 0,
        });
      });
    });

    return updatedMatches;
  }, [matches, pendingMatchChanges]);

  const matchesBySession = useMemo(() => {
    if (matchesWithPendingChanges === null) return {};

    const grouped = matchesWithPendingChanges.reduce((acc, match) => {
      const sessionId = match['Session ID'];
      
      if (sessionId != null) {
        const key = `session-${sessionId}`;
        if (!acc[key]) {
          acc[key] = createSessionGroup(
            sessionId,
            match['Session Name'],
            match['Session Status'],
            match['Session Created At'],
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
          grouped[key] = createSessionGroup(
            sessionId,
            sessionMetadata.name || `Session ${sessionId}`,
            sessionMetadata.status || 'SUBMITTED',
            sessionMetadata.createdAt,
            sessionMetadata.updatedAt,
            sessionMetadata.createdBy,
            sessionMetadata.updatedBy
          );
        } else {
          const sessionMatch = matches?.find(m => m['Session ID'] === sessionId);
          if (sessionMatch) {
            grouped[key] = createSessionGroup(
              sessionId,
              sessionMatch['Session Name'] || `Session ${sessionId}`,
              sessionMatch['Session Status'] || 'SUBMITTED',
              sessionMatch['Session Created At'],
              sessionMatch['Session Updated At'],
              sessionMatch['Session Created By'],
              sessionMatch['Session Updated By']
            );
          }
        }
      }
    });
    return grouped;
  }, [matchesWithPendingChanges, Array.from(editingSessions).join(','), Array.from(editingSessionMetadata.keys()).join(','), matches]);

  useEffect(() => {
    if (!loading && matches !== null && Array.isArray(matches) && matchesWithPendingChanges !== null) {
      hasRenderedMatchesRef.current = true;
    } else if (loading || matches === null) {
      hasRenderedMatchesRef.current = false;
    }
  }, [loading, matches, matchesWithPendingChanges]);

  const activeSessionMatches = useMemo(() => {
    if (!activeSession || !matchesWithPendingChanges) return [];
    return matchesWithPendingChanges.filter(match => match['Session ID'] === activeSession.id);
  }, [activeSession, matchesWithPendingChanges]);

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
      // Helper to parse date from name (e.g., "12/11/2024" or "12/11")
      const parseDateFromName = (name) => {
        if (!name) return null;
        // Try to parse formats like "12/11/2024" or "12/11"
        const dateMatch = name.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
        if (dateMatch) {
          const [, month, day, year] = dateMatch;
          const currentYear = new Date().getFullYear();
          const parsedYear = year ? parseInt(year) : currentYear;
          // Create date in local timezone
          const date = new Date(parsedYear, parseInt(month) - 1, parseInt(day));
          return isNaN(date.getTime()) ? null : date;
        }
        return null;
      };
      
      // Helper to extract session number from name (e.g., "12/11/2024 Session #2" -> 2)
      const extractSessionNumber = (name) => {
        if (!name) return 0;
        const match = name.match(/Session #(\d+)/);
        return match ? parseInt(match[1]) : 0;
      };
      
      // Helper to normalize a date to just the date part (no time)
      const normalizeToDate = (dateStr) => {
        if (!dateStr) return null;
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return null;
        // Return date string in YYYY-MM-DD format for comparison
        return date.toISOString().split('T')[0];
      };
      
      // Get dates for comparison - prefer createdAt, then lastUpdated, then parse from name
      let dateA = groupA.createdAt || groupA.lastUpdated;
      let dateB = groupB.createdAt || groupB.lastUpdated;
      
      // If we don't have explicit dates, try to parse from names
      if (!dateA) {
        const parsed = parseDateFromName(groupA.name);
        if (parsed) dateA = parsed.toISOString();
      }
      if (!dateB) {
        const parsed = parseDateFromName(groupB.name);
        if (parsed) dateB = parsed.toISOString();
      }
      
      // Normalize dates to just the date part (no time) for comparison
      const normalizedDateA = normalizeToDate(dateA);
      const normalizedDateB = normalizeToDate(dateB);
      
      // Compare by date first
      if (normalizedDateA && normalizedDateB) {
        // Compare date strings (YYYY-MM-DD format is sortable)
        // Negate for descending order (newer dates first)
        const dateDiff = -normalizedDateB.localeCompare(normalizedDateA);
        // If dates are the same, sort by creation time or session number
        if (dateDiff === 0) {
          // Prefer creation time if available (newer sessions first)
          if (groupA.createdAt && groupB.createdAt) {
            const timeDiff = new Date(groupB.createdAt) - new Date(groupA.createdAt);
            if (timeDiff !== 0) {
              return timeDiff;
            }
          }
          // If creation times are same or unavailable, sort by session number (higher numbers first)
          const sessionNumA = extractSessionNumber(groupA.name);
          const sessionNumB = extractSessionNumber(groupB.name);
          if (sessionNumA !== sessionNumB) {
            return sessionNumB - sessionNumA; // Higher session numbers first
          }
        }
        // Return negative/positive/zero based on string comparison
        return dateDiff;
      }
      if (normalizedDateA && !normalizedDateB) return -1;
      if (!normalizedDateA && normalizedDateB) return 1;
      
      // Final fallback to alphabetical
      return groupB.name.localeCompare(groupA.name);
    });
  }, [matchesBySession]);

  const isDataReady = !loading && matches !== null && Array.isArray(matches) && 
                      matchesWithPendingChanges !== null && Array.isArray(matchesWithPendingChanges);
  const showAddMatchCard = isDataReady && hasRenderedMatchesRef.current;
  
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
      const editingSessionId = editingSessions.size > 0 ? Array.from(editingSessions)[0] : null;
      
      if (editingSessionId) {
        matchPayload.session_id = editingSessionId;
      } else if (activeSession) {
        matchPayload.session_id = activeSession.id;
      } else if (leagueId) {
        matchPayload.league_id = leagueId;
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
      league
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
            onClick={() => openModal(MODAL_TYPES.ADD_MATCH, {
              onSubmit: handleAddMatch,
              onDelete: onDeleteMatch,
              allPlayerNames,
              leagueMatchOnly: !!leagueId,
              defaultLeagueId: leagueId,
              members,
              league
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
          <p>No matches yet. Start a session and add your first match!</p>
        </div>
      )}

      {activeSession && (
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
            league
          })}
          onEditMatch={handleEditMatch}
          onSubmitClick={() => openModal(MODAL_TYPES.CONFIRMATION, {
            title: "Submit Scores",
            message: "Are you sure you want to submit these scores? Once submitted, games will be locked in and only league admins will be able to edit.",
            confirmText: "Submit Scores",
            cancelText: "Cancel",
            onConfirm: () => handleLockInSession(activeSession.id),
            gameCount: activeSessionMatches.length,
            playerCount: playerCount,
            matches: activeSessionMatches
          })}
          onDeleteSession={onDeleteSession}
        />
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
            return (
              <ActiveSessionPanel
                key={key}
                activeSession={{ id: group.id, name: group.name }}
                activeSessionMatches={group.matches}
                onPlayerClick={onPlayerClick}
                onAddMatchClick={() => openModal(MODAL_TYPES.ADD_MATCH, {
                  onSubmit: handleAddMatch,
                  onDelete: onDeleteMatch,
                  allPlayerNames,
                  leagueMatchOnly: !!leagueId,
                  defaultLeagueId: leagueId,
                  members,
                  league
                })}
                onEditMatch={handleEditMatch}
                onSaveClick={() => onSaveEditedSession(group.id)}
                onCancelClick={() => onCancelEdit(group.id)}
                onDeleteSession={onDeleteSession}
                isEditing={true}
              />
            );
          }
          
          return (
            <div 
              key={key} 
              className="match-date-group"
            >
              <h3 className="match-date-header">
                {group.name}
                {canEdit && (
                  <button
                    className="edit-session-button"
                    onClick={() => onEnterEditMode(group.id)}
                    title="Edit Session"
                  >
                    <Edit2 size={16} />
                  </button>
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

