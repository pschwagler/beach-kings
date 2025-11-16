import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../ui/UI';
import MatchCard from './MatchCard';
import AddMatchModal from './AddMatchModal';
import ConfirmationModal from '../modal/ConfirmationModal';
import ActiveSessionPanel from '../session/ActiveSessionPanel';

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
  allPlayerNames 
}) {
  const [isAddMatchModalOpen, setIsAddMatchModalOpen] = useState(false);
  const [isEndSessionModalOpen, setIsEndSessionModalOpen] = useState(false);
  const [editingMatch, setEditingMatch] = useState(null);

  // Check if URL contains ?gameon query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const gameOnMode = urlParams.has('gameon');

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
      if (!activeSession) {
        alert('No active session. Please create a session first.');
        return;
      }
      await onCreateMatch({
        ...matchData,
        session_id: activeSession.id
      });
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
      {/* Start Session button - shows when no active session in gameon mode */}
      {gameOnMode && !activeSession && (
        <div className="session-controls-start">
          <Button variant="success" onClick={onCreateSession} className="start-session-btn">
            <Plus size={20} />
            Start New Session
          </Button>
        </div>
      )}

      {matches.length === 0 && gameOnMode && !activeSession && (
        <div className="loading">No matches yet. Start a session and add your first match!</div>
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

      <ConfirmationModal
        isOpen={isEndSessionModalOpen}
        onClose={() => setIsEndSessionModalOpen(false)}
        onConfirm={handleLockInSession}
        title="Submit Scores"
        message="Are you sure you want to submit these scores? Once submitted, matches will be locked in and no edits will be allowed."
        confirmText="Submit Scores"
        cancelText="Cancel"
      />
    </div>
  );
}

