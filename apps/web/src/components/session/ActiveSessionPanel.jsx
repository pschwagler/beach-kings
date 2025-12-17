import { Plus, Save, Trophy, Users, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import MatchCard from '../match/MatchCard';
import SessionHeader from './SessionHeader';
import SessionActions from './SessionActions';
import { formatDateRange } from '../league/utils/leagueUtils';

// Helper function to get unique players from matches
function getUniquePlayersCount(matches) {
  const players = new Set();
  matches.forEach(match => {
    if (match['Team 1 Player 1']) players.add(match['Team 1 Player 1']);
    if (match['Team 1 Player 2']) players.add(match['Team 1 Player 2']);
    if (match['Team 2 Player 1']) players.add(match['Team 2 Player 1']);
    if (match['Team 2 Player 2']) players.add(match['Team 2 Player 2']);
  });
  return players.size;
}

export default function ActiveSessionPanel({ 
  activeSession, 
  activeSessionMatches, 
  onPlayerClick,
  onAddMatchClick,
  onEditMatch,
  onSubmitClick,
  onSaveClick,
  onCancelClick,
  onDeleteSession,
  onUpdateSessionSeason,
  onStatsClick,
  isEditing = false,
  seasons = [],
  selectedSeasonId = null
}) {
  const gameCount = activeSessionMatches.length;
  const playerCount = getUniquePlayersCount(activeSessionMatches);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const seasonDropdownRef = useRef(null);

  // Get the season for this session
  const sessionSeasonId = activeSession?.season_id;
  const sessionSeason = sessionSeasonId ? seasons.find(s => s.id === sessionSeasonId) : null;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(event.target)) {
        setIsSeasonDropdownOpen(false);
      }
    };

    if (isSeasonDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isSeasonDropdownOpen]);

  const handleDeleteSession = () => {
    if (onDeleteSession) {
      onDeleteSession(activeSession.id);
    }
  };

  return (
    <div className="active-session-panel">
      <SessionHeader 
        sessionName={activeSession.name}
        gameCount={gameCount}
        playerCount={playerCount}
        onDelete={gameCount === 0 ? handleDeleteSession : null}
        onStatsClick={onStatsClick}
        isEditing={isEditing}
      />

      {/* Season selector - show if session has a season_id (seasons array should always be populated) */}
      {sessionSeasonId && (
        <div className="session-season-selector">
          <span className="session-season-label">Season:</span>
          <div className="season-dropdown-wrapper" ref={seasonDropdownRef}>
            {sessionSeason ? (
              <>
                <div
                  className="season-dropdown-trigger"
                  onClick={() => setIsSeasonDropdownOpen(!isSeasonDropdownOpen)}
                >
                  <span className="season-name">{sessionSeason.name || `Season ${sessionSeason.id}`}</span>
                  {sessionSeason.start_date && sessionSeason.end_date && (
                    <span className="season-dates">
                      {formatDateRange(sessionSeason.start_date, sessionSeason.end_date)}
                    </span>
                  )}
                  <ChevronDown size={14} className={isSeasonDropdownOpen ? 'rotate-180' : ''} />
                </div>
                {isSeasonDropdownOpen && seasons.length > 1 && (
                  <div className="season-dropdown-menu">
                    {seasons.map((season) => (
                      <div
                        key={season.id}
                        className={`season-dropdown-option ${sessionSeasonId === season.id ? 'selected' : ''}`}
                        onClick={async () => {
                          if (sessionSeasonId !== season.id && onUpdateSessionSeason) {
                            try {
                              await onUpdateSessionSeason(activeSession.id, season.id);
                              setIsSeasonDropdownOpen(false);
                            } catch (error) {
                              console.error('Error updating session season:', error);
                              // Keep dropdown open on error so user can try again
                            }
                          } else {
                            setIsSeasonDropdownOpen(false);
                          }
                        }}
                      >
                        <span className="season-name">
                          {season.name || `Season ${season.id}`}
                        </span>
                        {season.start_date && season.end_date && (
                          <span className="season-dates">
                            {formatDateRange(season.start_date, season.end_date)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <span className="season-id-text">
                Season {sessionSeasonId}
              </span>
            )}
          </div>
        </div>
      )}

      <SessionActions 
        onAddMatchClick={onAddMatchClick}
        onSubmitClick={onSubmitClick}
        onSaveClick={onSaveClick}
        onCancelClick={onCancelClick}
        isEditing={isEditing}
      />

      <div className="session-matches-section">
        <div className="session-matches-label">
          Session Games
        </div>
        {activeSessionMatches.length === 0 ? (
          <div className="session-empty-state">
            <Trophy size={40} className="session-empty-icon" />
            <div className="session-empty-text">
              No matches recorded. Start by adding your first match!
            </div>
          </div>
        ) : (
          <div className="match-cards">
            {activeSessionMatches.map((match, idx) => (
              <MatchCard
                key={idx}
                match={match}
                onPlayerClick={onPlayerClick}
                onEdit={onEditMatch}
                showEdit={true}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


