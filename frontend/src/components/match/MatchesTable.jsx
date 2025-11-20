import { useState, useMemo } from 'react';
import { Plus, Edit2 } from 'lucide-react';
import { Button } from '../ui/UI';
import MatchCard from './MatchCard';
import AddMatchModal from './AddMatchModal';
import ConfirmationModal from '../modal/ConfirmationModal';
import ActiveSessionPanel from '../session/ActiveSessionPanel';

// Helper function to format timestamp as relative time or date
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
    // Format as "Jan 15, 2024"
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
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
  isLeagueMember = false,
  leagueId = null,
  isAdmin = false,
  editingSessions = new Set(),
  onEnterEditMode,
  onSaveEditedSession,
  onCancelEdit,
  pendingMatchChanges = new Map(),
  editingSessionMetadata = new Map()
}) {
  const [isAddMatchModalOpen, setIsAddMatchModalOpen] = useState(false);
  const [isEndSessionModalOpen, setIsEndSessionModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);

  // Use isLeagueMember prop instead of checking ?gameon query parameter
  const gameOnMode = isLeagueMember;

  // Apply pending changes to matches for display
  const matchesWithPendingChanges = useMemo(() => {
    if (pendingMatchChanges.size === 0) {
      return matches;
    }

    let updatedMatches = [...matches];

    // Apply pending changes for each editing session
    pendingMatchChanges.forEach((sessionChanges, sessionId) => {
      // Remove deleted matches
      if (sessionChanges.deletions && sessionChanges.deletions.length > 0) {
        updatedMatches = updatedMatches.filter(m => !sessionChanges.deletions.includes(m.id));
      }
      
      // Apply updates to existing matches
      sessionChanges.updates.forEach((updatedData, matchId) => {
        const matchIndex = updatedMatches.findIndex(m => m.id === matchId);
        if (matchIndex !== -1) {
          // Update the match with pending changes
          const match = updatedMatches[matchIndex];
          updatedMatches[matchIndex] = {
            ...match,
            'Team 1 Player 1': updatedData.team1_player1 || match['Team 1 Player 1'],
            'Team 1 Player 2': updatedData.team1_player2 || match['Team 1 Player 2'],
            'Team 2 Player 1': updatedData.team2_player1 || match['Team 2 Player 1'],
            'Team 2 Player 2': updatedData.team2_player2 || match['Team 2 Player 2'],
            'Team 1 Score': updatedData.team1_score !== undefined ? updatedData.team1_score : match['Team 1 Score'],
            'Team 2 Score': updatedData.team2_score !== undefined ? updatedData.team2_score : match['Team 2 Score'],
            Winner: updatedData.team1_score > updatedData.team2_score ? 'Team 1' : 
                   updatedData.team1_score < updatedData.team2_score ? 'Team 2' : 'Tie'
          };
        }
      });

      // Add new matches (with temporary IDs)
      sessionChanges.additions.forEach((newMatchData, index) => {
        const tempId = `pending-${sessionId}-${index}`;
        const winner = newMatchData.team1_score > newMatchData.team2_score ? 'Team 1' : 
                      newMatchData.team1_score < newMatchData.team2_score ? 'Team 2' : 'Tie';
        
        // Find session name from existing matches
        const sessionMatch = updatedMatches.find(m => m['Session ID'] === sessionId);
        const sessionName = sessionMatch ? sessionMatch['Session Name'] : 'New Session';
        
        updatedMatches.push({
          id: tempId,
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
          Winner: winner,
          'Team 1 ELO Change': 0,
          'Team 2 ELO Change': 0,
        });
      });
    });

    return updatedMatches;
  }, [matches, pendingMatchChanges]);

  // Group matches by session (or by date for legacy matches without session)
  // This must be before any early returns to maintain consistent hook order
  const matchesBySession = useMemo(() => {
    const grouped = matchesWithPendingChanges.reduce((acc, match) => {
      const sessionId = match['Session ID'];
      const sessionName = match['Session Name'];
      const sessionStatus = match['Session Status'];
      const sessionCreatedAt = match['Session Created At'];
      const sessionUpdatedAt = match['Session Updated At'];
      const sessionCreatedBy = match['Session Created By'];
      const sessionUpdatedBy = match['Session Updated By'];
      
      // For matches with a session, group by session
      if (sessionId !== null && sessionId !== undefined) {
        const key = `session-${sessionId}`;
        if (!acc[key]) {
          acc[key] = {
            type: 'session',
            id: sessionId,
            name: sessionName,
            status: sessionStatus,
            isActive: sessionStatus === 'ACTIVE',
            createdAt: sessionCreatedAt,
            updatedAt: sessionUpdatedAt,
            createdBy: sessionCreatedBy,
            updatedBy: sessionUpdatedBy,
            lastUpdated: sessionUpdatedAt || sessionCreatedAt, // Use updated_at if available, else created_at
            matches: []
          };
        }
        acc[key].matches.push(match);
        // Update status, updatedBy, updatedAt if this match has them
        if (sessionStatus) {
          acc[key].status = sessionStatus;
          acc[key].isActive = sessionStatus === 'ACTIVE';
        }
        if (sessionUpdatedBy) {
          acc[key].updatedBy = sessionUpdatedBy;
        }
        if (sessionUpdatedAt) {
          acc[key].updatedAt = sessionUpdatedAt;
          acc[key].lastUpdated = sessionUpdatedAt; // Update lastUpdated when we see updatedAt
        }
      } else {
        // For legacy matches, group by date
        const key = `date-${match.Date}`;
        if (!acc[key]) {
          acc[key] = {
            type: 'date',
            name: match.Date,
            createdAt: null, // Legacy matches don't have created_at
            lastUpdated: null, // Legacy matches don't have timestamps
            createdBy: null,
            updatedBy: null,
            matches: []
          };
        }
        acc[key].matches.push(match);
      }
      return acc;
    }, {});

    // Ensure sessions in edit mode are included even if all matches are deleted
    editingSessions.forEach(sessionId => {
      const key = `session-${sessionId}`;
      if (!grouped[key]) {
        // First try to get session info from stored metadata
        const sessionMetadata = editingSessionMetadata.get(sessionId);
        if (sessionMetadata) {
          grouped[key] = {
            type: 'session',
            id: sessionId,
            name: sessionMetadata.name || `Session ${sessionId}`,
            status: sessionMetadata.status || 'SUBMITTED',
            isActive: sessionMetadata.status === 'ACTIVE',
            createdAt: sessionMetadata.createdAt,
            updatedAt: sessionMetadata.updatedAt,
            createdBy: sessionMetadata.createdBy,
            updatedBy: sessionMetadata.updatedBy,
            lastUpdated: sessionMetadata.updatedAt || sessionMetadata.createdAt,
            matches: []
          };
        } else {
          // Fallback: find session info from original matches
          const sessionMatch = matches.find(m => m['Session ID'] === sessionId);
          if (sessionMatch) {
            grouped[key] = {
              type: 'session',
              id: sessionId,
              name: sessionMatch['Session Name'] || `Session ${sessionId}`,
              status: sessionMatch['Session Status'] || 'SUBMITTED',
              isActive: sessionMatch['Session Status'] === 'ACTIVE',
              createdAt: sessionMatch['Session Created At'],
              updatedAt: sessionMatch['Session Updated At'],
              createdBy: sessionMatch['Session Created By'],
              updatedBy: sessionMatch['Session Updated By'],
              lastUpdated: sessionMatch['Session Updated At'] || sessionMatch['Session Created At'],
              matches: []
            };
          }
        }
      }
    });
    
    return grouped;
  }, [matchesWithPendingChanges, Array.from(editingSessions).join(','), Array.from(editingSessionMetadata.keys()).join(','), matches]);

  // Early returns must come AFTER all hooks
  if (loading) {
    return <div className="loading">Loading matches...</div>;
  }

  if (matchesWithPendingChanges.length === 0 && !gameOnMode) {
    return <div className="loading">No matches available yet. Click "Recalculate Stats" to load data.</div>;
  }

  // Sort matches within each session group by id (descending - newest first)
  // Match id represents creation order since it's auto-incrementing
  Object.values(matchesBySession).forEach(group => {
    if (group.matches && group.matches.length > 0) {
      group.matches.sort((a, b) => {
        // Sort by match id descending (newest first)
        const idA = a.id || 0;
        const idB = b.id || 0;
        return idB - idA;
      });
    }
  });

  const handleAddMatch = async (matchData, matchId) => {
    if (matchId) {
          // Edit mode - find which session this match belongs to
      const match = matchesWithPendingChanges.find(m => m.id === matchId);
      const sessionId = match ? match['Session ID'] : null;
      
      // Check if we're editing this session
      const isEditingSession = sessionId && editingSessions.has(sessionId);
      
      if (isEditingSession) {
        // Pass sessionId so it stores changes locally
        await onUpdateMatch(matchId, matchData, sessionId);
      } else {
        // Not in editing mode, update immediately
        await onUpdateMatch(matchId, matchData);
      }
      setEditingMatch(null);
    } else {
      // Create mode
      let matchPayload = { ...matchData };
      let editingSessionId = null;
      
      // Check if we're in editing mode for a session (use the specific session_id)
      if (editingSessions.size > 0) {
        editingSessionId = Array.from(editingSessions)[0];
        matchPayload.session_id = editingSessionId;
        // When editing, session_id is sufficient - backend will use that specific session
      } else if (activeSession) {
        // Use active session if available
        matchPayload.session_id = activeSession.id;
      } else if (leagueId) {
        // No session - pass league_id and let backend find/create session
        matchPayload.league_id = leagueId;
        // Date is optional - backend defaults to today if not provided
        // Backend will automatically:
        // - Use active session if one exists for this league/date
        // - Use submitted/edited session if user is admin and editing
        // - Create new active session if none exists
      } else {
        throw new Error('leagueId is required to create a match');
      }
      
      // Create the match - if editing, pass sessionId to store locally
      if (editingSessionId) {
        await onCreateMatch(matchPayload, editingSessionId);
      } else {
        await onCreateMatch(matchPayload);
        // Refresh active session after creating match (in case a new session was created)
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

  // Sort session groups by created_at (newest first), then by name for legacy date groups
  const sessionGroups = Object.entries(matchesBySession).sort(([keyA, groupA], [keyB, groupB]) => {
    // If both have created_at, sort by created_at descending (newest first)
    if (groupA.createdAt && groupB.createdAt) {
      return new Date(groupB.createdAt) - new Date(groupA.createdAt);
    }
    // If only one has created_at, prioritize it (sessions with created_at come first)
    if (groupA.createdAt && !groupB.createdAt) return -1;
    if (!groupA.createdAt && groupB.createdAt) return 1;
    // If neither has created_at (legacy date groups), sort by name descending
    return groupB.name.localeCompare(groupA.name);
  });
  
  // Get matches for active session
  const activeSessionMatches = activeSession 
    ? matchesWithPendingChanges.filter(match => match['Session ID'] === activeSession.id)
    : [];

  return (
    <div className="matches-container">
      {/* Add Matches Section - Modern iOS Style */}
      {gameOnMode && !activeSession && (
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

      {matchesWithPendingChanges.length === 0 && gameOnMode && !activeSession && (
        <div className="add-matches-empty-state">
          <p>No matches yet. Start a session and add your first match!</p>
        </div>
      )}

      {/* Active session - Retro Pro Design */}
      {gameOnMode && activeSession && (
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

      {/* Session/date groups (exclude active session if in gameon mode) */}
      {sessionGroups
        .filter(([key, group]) => {
          // In gameon mode, filter out the active session
          if (gameOnMode && activeSession && group.type === 'session' && group.id === activeSession.id) {
            return false;
          }
          return true;
        })
        .map(([key, group]) => {
          const isEditing = group.type === 'session' && editingSessions.has(group.id);
          const canEdit = isAdmin && group.type === 'session' && 
                         (group.status === 'SUBMITTED' || group.status === 'EDITED') && 
                         !isEditing;
          
          // If in editing mode, render similar to active session
          if (isEditing && group.type === 'session') {
            const editingSessionMatches = group.matches;
            return (
              <ActiveSessionPanel
                key={key}
                activeSession={{ id: group.id, name: group.name }}
                activeSessionMatches={editingSessionMatches}
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
              className={`match-date-group ${group.type === 'session' && group.isActive ? 'active-session-group' : ''}`}
            >
              <h3 className="match-date-header">
                {group.type === 'session' && group.isActive && (
                  <span className="active-badge">Pending</span>
                )}
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
                  {group.status === 'EDITED' && group.updatedBy
                    ? `Edited ${formatSessionTimestamp(group.lastUpdated)} by ${group.updatedBy}`
                    : group.status === 'SUBMITTED' && group.updatedBy
                    ? `Submitted ${formatSessionTimestamp(group.lastUpdated)} by ${group.updatedBy}`
                    : group.status === 'SUBMITTED' && group.createdBy
                    ? `Submitted ${formatSessionTimestamp(group.lastUpdated)} by ${group.createdBy}`
                    : formatSessionTimestamp(group.lastUpdated)
                  }
                </div>
              )}
            </div>
          );
        })}

      {/* Modals */}
      <AddMatchModal
        isOpen={isAddMatchModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleAddMatch}
        onDelete={onDeleteMatch}
        allPlayerNames={allPlayerNames}
        editMatch={editingMatch}
      />
      {/* Debug: Log allPlayerNames when modal state changes */}
      {isAddMatchModalOpen && console.log('MatchesTable: allPlayerNames passed to modal:', allPlayerNames, 'Length:', allPlayerNames?.length)}

      <ConfirmationModal
        isOpen={isEndSessionModalOpen}
        onClose={() => setIsEndSessionModalOpen(false)}
        onConfirm={handleLockInSession}
        title="Submit Scores"
        message="Are you sure you want to submit these scores? Once submitted, matches will be locked in and no edits will be allowed."
        confirmText="Submit Scores"
        cancelText="Cancel"
        gameCount={activeSessionMatches.length}
        playerCount={(() => {
          const players = new Set();
          activeSessionMatches.forEach(match => {
            if (match['Team 1 Player 1']) players.add(match['Team 1 Player 1']);
            if (match['Team 1 Player 2']) players.add(match['Team 1 Player 2']);
            if (match['Team 2 Player 1']) players.add(match['Team 2 Player 1']);
            if (match['Team 2 Player 2']) players.add(match['Team 2 Player 2']);
          });
          return players.size;
        })()}
        matches={activeSessionMatches}
      />
    </div>
  );
}

