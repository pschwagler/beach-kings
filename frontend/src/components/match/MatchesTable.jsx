import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui/UI';
import MatchCard from './MatchCard';
import AddMatchModal from './AddMatchModal';
import ConfirmationModal from '../modal/ConfirmationModal';
import ActiveSessionPanel from '../session/ActiveSessionPanel';
import { createLeagueSession, getActiveSession } from '../../services/api';

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
  onCreatePlayer,
  allPlayerNames,
  isLeagueMember = false,
  leagueId = null
}) {
  const [isAddMatchModalOpen, setIsAddMatchModalOpen] = useState(false);
  const [isEndSessionModalOpen, setIsEndSessionModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);

  // Use isLeagueMember prop instead of checking ?gameon query parameter
  const gameOnMode = isLeagueMember;

  if (loading) {
    return <div className="loading">Loading matches...</div>;
  }

  if (matches.length === 0 && !gameOnMode) {
    return <div className="loading">No matches available yet. Click "Recalculate Stats" to load data.</div>;
  }

  // Group matches by session (or by date for legacy matches without session)
  const matchesBySession = matches.reduce((acc, match) => {
    const sessionId = match['Session ID'];
    const sessionName = match['Session Name'];
    const isActive = match['Session Active'];
    
    // For matches with a session, group by session
    if (sessionId !== null && sessionId !== undefined) {
      const key = `session-${sessionId}`;
      if (!acc[key]) {
        acc[key] = {
          type: 'session',
          id: sessionId,
          name: sessionName,
          isActive: isActive,
          matches: []
        };
      }
      acc[key].matches.push(match);
    } else {
      // For legacy matches, group by date
      const key = `date-${match.Date}`;
      if (!acc[key]) {
        acc[key] = {
          type: 'date',
          name: match.Date,
          matches: []
        };
      }
      acc[key].matches.push(match);
    }
    return acc;
  }, {});

  const handleAddMatch = async (matchData, matchId) => {
    if (matchId) {
      // Edit mode
      await onUpdateMatch(matchId, matchData);
      setEditingMatch(null);
    } else {
      // Create mode
      let currentSession = activeSession;
      
      // If no active session exists, create one first
      if (!currentSession && leagueId) {
        try {
          // Create a new session
          const dateStr = new Date().toISOString().split('T')[0];
          const [year, month, day] = dateStr.split('-');
          const formattedDate = `${parseInt(month)}/${parseInt(day)}/${year}`;
          
          await createLeagueSession(leagueId, {
            date: formattedDate,
            name: undefined
          });
          
          // Get the newly created active session
          const newSession = await getActiveSession();
          currentSession = newSession;
          
          // Also trigger the parent's onCreateSession to update state
          if (onCreateSession) {
            await onCreateSession();
          }
        } catch (err) {
          console.error('Error creating session:', err);
          // Continue without session if creation fails
        }
      }
      
      // Create the match with the session_id if we have one
      if (currentSession) {
        await onCreateMatch({
          ...matchData,
          session_id: currentSession.id
        });
      } else {
        // Fallback: create match without session
        await onCreateMatch(matchData);
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

  const sessionGroups = Object.entries(matchesBySession);
  
  // Get matches for active session
  const activeSessionMatches = activeSession 
    ? matches.filter(match => match['Session ID'] === activeSession.id)
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
              Click to add your first match. A session will be created automatically.
            </p>
          </button>
        </div>
      )}

      {matches.length === 0 && gameOnMode && !activeSession && (
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
        .map(([key, group]) => (
          <div 
            key={key} 
            className={`match-date-group ${group.type === 'session' && group.isActive ? 'active-session-group' : ''}`}
          >
            <h3 className="match-date-header">
              {group.type === 'session' && group.isActive && (
                <span className="active-badge">Pending</span>
              )}
              {group.name}
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
          </div>
        ))}

      {/* Modals */}
      <AddMatchModal
        isOpen={isAddMatchModalOpen}
        onClose={handleCloseModal}
        onSubmit={handleAddMatch}
        onDelete={onDeleteMatch}
        allPlayerNames={allPlayerNames}
        onCreatePlayer={onCreatePlayer}
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

