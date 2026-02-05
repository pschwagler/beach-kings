import { Trophy, Users, Edit2 } from 'lucide-react';

/**
 * Shared header for a session group in submitted/completed style (match-date-header).
 * Used in MatchesTable for each completed session group and in ActiveSessionPanel
 * when the session is submitted/ended (no Recording badge or red dot).
 *
 * @param {Object} props
 * @param {string} props.sessionName - Display name of the session
 * @param {number} props.gameCount - Number of games
 * @param {number} props.playerCount - Number of unique players
 * @param {() => void} [props.onStatsClick] - Called when stats row is clicked (e.g. open summary modal)
 * @param {() => void} [props.onEditClick] - Called when edit (pencil) button is clicked
 * @param {string} [props.timestampText] - Optional line below header, e.g. "Submitted 2 days ago by John"
 * @param {string} [props.seasonBadge] - Optional season label to show next to name
 * @param {string} [props.editButtonTestId] - data-testid for the edit button
 */
export default function SessionGroupHeader({
  sessionName,
  gameCount,
  playerCount,
  onStatsClick,
  onEditClick,
  timestampText,
  seasonBadge,
  editButtonTestId = 'edit-session-button',
}) {
  const showStats = gameCount > 0;
  const statsContent = showStats && (
    <div
      className={`session-stats ${onStatsClick ? 'session-stats-clickable match-date-header-stats' : 'match-date-header-stats'}`}
      onClick={onStatsClick}
      role={onStatsClick ? 'button' : undefined}
      tabIndex={onStatsClick ? 0 : undefined}
      onKeyDown={onStatsClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStatsClick(); } } : undefined}
    >
      <div className="session-stat">
        <Trophy size={16} />
        {gameCount} {gameCount === 1 ? 'game' : 'games'}
      </div>
      <div className="session-stat">
        <Users size={16} />
        {playerCount} {playerCount === 1 ? 'player' : 'players'}
      </div>
    </div>
  );

  return (
    <>
      <h3 className="match-date-header">
        <span className="match-date-header-left">
          {sessionName}
          {onEditClick && (
            <button
              type="button"
              className="edit-session-button"
              onClick={onEditClick}
              title="Edit Session"
              data-testid={editButtonTestId}
            >
              <Edit2 size={16} />
            </button>
          )}
          {seasonBadge && (
            <span className="season-badge">
              {seasonBadge}
            </span>
          )}
        </span>
        {statsContent}
      </h3>
      {timestampText && (
        <div className="session-timestamp">
          {timestampText}
        </div>
      )}
    </>
  );
}
