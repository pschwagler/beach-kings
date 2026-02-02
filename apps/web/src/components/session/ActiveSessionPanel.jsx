import { Trophy, Users, ChevronDown } from 'lucide-react';
import { useState, useRef } from 'react';
import MatchCard from '../match/MatchCard';
import SessionMatchesClipboardTable from '../match/SessionMatchesClipboardTable';
import SessionHeader from './SessionHeader';
import SessionActions from './SessionActions';
import { formatDateRange } from '../league/utils/leagueUtils';
import { useClickOutside } from '../../hooks/useClickOutside';
import { getUniquePlayersCount } from '../league/utils/matchUtils';

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
  onRequestDeleteSession,
  onRequestLeaveSession,
  onUpdateSessionSeason,
  onStatsClick,
  isEditing = false,
  seasons = [],
  selectedSeasonId = null,
  contentVariant = 'cards',
  isAdmin = false,
  variant = null, // 'league' | 'non-league'; when null, derived from activeSession.season_id
}) {
  const gameCount = activeSessionMatches.length;
  const playerCount = getUniquePlayersCount(activeSessionMatches);
  const [isSeasonDropdownOpen, setIsSeasonDropdownOpen] = useState(false);
  const seasonDropdownRef = useRef(null);

  // Get the season for this session (league only; non-league has no season_id)
  const sessionSeasonId = activeSession?.season_id ?? null;
  const isLeague = variant === 'league' || (variant !== 'non-league' && sessionSeasonId != null);
  const sessionSeason = sessionSeasonId ? seasons.find(s => s.id === sessionSeasonId) : null;

  useClickOutside(seasonDropdownRef, isSeasonDropdownOpen, () => setIsSeasonDropdownOpen(false));

  return (
    <div className="active-session-panel" data-testid="active-session-panel">
      <SessionHeader
        sessionName={activeSession.name}
        gameCount={gameCount}
        playerCount={playerCount}
        onStatsClick={onStatsClick}
        onRequestDelete={isAdmin && onRequestDeleteSession ? onRequestDeleteSession : undefined}
        onRequestLeave={!isAdmin && onRequestLeaveSession ? onRequestLeaveSession : undefined}
        isEditing={isEditing}
      />

      {/* Season selector row (league only) */}
      {isLeague && sessionSeasonId ? (
        <div className="session-season-row">
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
        </div>
      ) : null}

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
        {activeSessionMatches.length === 0 && contentVariant === 'cards' ? (
          <div className="session-empty-state">
            <Trophy size={40} className="session-empty-icon" />
            <div className="session-empty-text">
              No matches recorded. Start by adding your first match!
            </div>
          </div>
        ) : contentVariant === 'clipboard' ? (
          <SessionMatchesClipboardTable
            matches={activeSessionMatches}
            onPlayerClick={onPlayerClick}
            onEditMatch={onEditMatch}
            canAddMatch={true}
            onAddMatch={() => onAddMatchClick()}
            sessionId={activeSession?.id}
            seasonId={sessionSeasonId}
            showActions={true}
          />
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
