import { Trophy, Users, X } from 'lucide-react';

export default function SessionHeader({ sessionName, gameCount, playerCount, onDelete, isEditing = false, onStatsClick }) {
  return (
    <div className="session-header">
      <div className="session-title-group">
        {isEditing ? (
          <div className="editing-badge" style={{ backgroundColor: '#f59e0b', color: 'white', padding: '4px 12px', borderRadius: '12px', fontSize: '12px', fontWeight: '600' }}>
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
      
      <div className={`session-stats ${onStatsClick ? 'session-stats-clickable' : ''}`} onClick={onStatsClick}>
        <div className="session-stat">
          <Trophy size={18} />
          {gameCount} {gameCount === 1 ? 'game' : 'games'}
        </div>
        <div className="session-stat">
          <Users size={18} />
          {playerCount} {playerCount === 1 ? 'player' : 'players'}
        </div>
        {onDelete && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="session-delete-btn"
            title="Delete empty session"
          >
            <X size={20} />
          </button>
        )}
      </div>
    </div>
  );
}


