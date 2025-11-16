import { Trophy, Users, X } from 'lucide-react';

export default function SessionHeader({ sessionName, gameCount, playerCount, onDelete }) {
  return (
    <div className="session-header">
      <div className="session-title-group">
        <div className="recording-badge">
          <div className="recording-dot" />
          Recording
        </div>
        <h3 className="session-name">
          {sessionName}
        </h3>
      </div>
      
      <div className="session-stats">
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
            onClick={onDelete}
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


