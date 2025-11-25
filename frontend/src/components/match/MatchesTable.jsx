import { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Edit2 } from 'lucide-react';
import MatchCard from './MatchCard';
import AddMatchModal from './AddMatchModal';
import ConfirmationModal from '../modal/ConfirmationModal';
import ActiveSessionPanel from '../session/ActiveSessionPanel';
import { MatchesTableSkeleton } from '../ui/Skeletons';
import { useLeague } from '../../contexts/LeagueContext';

function formatSessionTimestamp(timestamp) {
  if (!timestamp) return null;
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    }
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}

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
  const { isLeagueMember } = useLeague();
  const [isAddMatchModalOpen, setIsAddMatchModalOpen] = useState(false);
  const [isEndSessionModalOpen, setIsEndSessionModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);
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

  if (loading || matches === null) {
    return <MatchesTableSkeleton isLeagueMember={isLeagueMember} />;
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
      setEditingMatch(null);
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
    setEditingMatch(match);
    setIsAddMatchModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddMatchModalOpen(false);
    setEditingMatch(null);
  };

  const handleLockInSession = async () => {
    if (activeSession) {
      await onEndSession(activeSession.id);
      setIsEndSessionModalOpen(false);
    }
  };

  const sessionGroups = Object.entries(matchesBySession).sort(([keyA, groupA], [keyB, groupB]) => {
    if (groupA.createdAt && groupB.createdAt) {
      return new Date(groupB.createdAt) - new Date(groupA.createdAt);
    }
    if (groupA.createdAt && !groupB.createdAt) return -1;
    if (!groupA.createdAt && groupB.createdAt) return 1;
    return groupB.name.localeCompare(groupA.name);
  });

  const isDataReady = !loading && matches !== null && Array.isArray(matches) && 
                      matchesWithPendingChanges !== null && Array.isArray(matchesWithPendingChanges);
  const showAddMatchCard = isDataReady && hasRenderedMatchesRef.current;
  
  return (
    <div className="matches-container">
      {showAddMatchCard && isLeagueMember && !activeSession && (
        <div className="add-matches-section">
          <button 
            className="add-matches-card"
            onClick={() => setIsAddMatchModalOpen(true)}
          >
            <div className="add-matches-icon">
              <Plus size={24} />
            </div>
            <h2 className="add-matches-title">Add Matches</h2>
            <p className="add-matches-description">
              Click to log a new match and start a session.
            </p>
          </button>
        </div>
      )}

      {showAddMatchCard && hasRenderedMatchesRef.current && matches.length === 0 && 
       matchesWithPendingChanges.length === 0 && 
       sessionGroups.length === 0 && 
       isLeagueMember && !activeSession && (
        <div className="add-matches-empty-state">
          <p>No matches yet. Start a session and add your first match!</p>
        </div>
      )}

      {isLeagueMember && activeSession && (
        <ActiveSessionPanel
          activeSession={activeSession}
          activeSessionMatches={activeSessionMatches}
          onPlayerClick={onPlayerClick}
          onAddMatchClick={() => setIsAddMatchModalOpen(true)}
          onEditMatch={handleEditMatch}
          onSubmitClick={() => setIsEndSessionModalOpen(true)}
          onDeleteSession={onDeleteSession}
        />
      )}

      {sessionGroups
        .filter(([key, group]) => {
          return !(isLeagueMember && activeSession && group.type === 'session' && group.id === activeSession.id);
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
                onAddMatchClick={() => setIsAddMatchModalOpen(true)}
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
                    style={{
                      marginLeft: '10px',
                      padding: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: 'transparent',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      color: '#374151',
                      cursor: 'pointer',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f3f4f6';
                      e.currentTarget.style.borderColor = '#9ca3af';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.borderColor = '#d1d5db';
                    }}
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
                    const timestamp = formatSessionTimestamp(group.lastUpdated);
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

      <AddMatchModal
        isOpen={isAddMatchModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleAddMatch}
        onDelete={onDeleteMatch}
        allPlayerNames={allPlayerNames}
        editMatch={editingMatch}
        leagueMatchOnly={!!leagueId}
        defaultLeagueId={leagueId}
      />

      <ConfirmationModal
        isOpen={isEndSessionModalOpen}
        onClose={() => setIsEndSessionModalOpen(false)}
        onConfirm={handleLockInSession}
        title="Submit Scores"
        message="Are you sure you want to submit these scores? Once submitted, matches will be locked in and no edits will be allowed."
        confirmText="Submit Scores"
        cancelText="Cancel"
        gameCount={activeSessionMatches.length}
        playerCount={playerCount}
        matches={activeSessionMatches}
      />
    </div>
  );
}

