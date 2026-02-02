import { Trophy, Users } from 'lucide-react';

export default function SessionHeader({ sessionName, gameCount, playerCount, isEditing = false, onStatsClick, onRequestDelete, onRequestLeave }) {
  const sessionAction = onRequestDelete
    ? { onClick: onRequestDelete, label: 'Delete Session', title: 'Delete session and all games', testId: 'session-btn-delete', className: 'session-btn session-btn-delete session-btn-delete-header' }
    : onRequestLeave
      ? { onClick: onRequestLeave, label: 'Leave Session', title: 'Leave this session', testId: 'session-btn-leave', className: 'session-btn session-btn-delete session-btn-delete-header' }
      : null;

  return (
    <div className="session-header">
      <div className="session-title-group">
        {isEditing ? (
          <div className="editing-badge">
            Editing
          </div>
        ) : (
          <div className="recording-badge">
            <div className="recording-dot" />
            Recording
          </div>
        )}
        <h3 className="session-name">
          {sessionName}
        </h3>
      </div>

      <div className="session-stats-row">
        <div className={`session-stats ${onStatsClick ? 'session-stats-clickable' : ''}`} onClick={onStatsClick}>
          <div className="session-stat">
            <Trophy size={18} />
            {gameCount} {gameCount === 1 ? 'game' : 'games'}
          </div>
          <div className="session-stat">
            <Users size={18} />
            {playerCount} {playerCount === 1 ? 'player' : 'players'}
          </div>
        </div>
        {sessionAction && (
          <button
            type="button"
            className={sessionAction.className}
            onClick={sessionAction.onClick}
            data-testid={sessionAction.testId}
            title={sessionAction.title}
          >
            {sessionAction.label}
          </button>
        )}
      </div>
    </div>
  );
}
