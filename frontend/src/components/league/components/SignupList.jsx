import { useState } from 'react';
import { Calendar, Edit2, Trash2, Users, Clock, MapPin, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDateTimeWithTimezone, formatDate, formatTime } from '../../../utils/dateUtils';

/**
 * Component for rendering signup lists (upcoming and past)
 */
export default function SignupList({
  signups,
  loading,
  isUpcoming = true,
  isLeagueMember = false,
  isLeagueAdmin = false,
  currentUserPlayer,
  onSignup,
  onDropout,
  onEdit,
  onDelete,
  showCreateButton = false,
  onCreateClick,
}) {
  const [collapsedSignups, setCollapsedSignups] = useState(new Set());
  const [expandedPastSignups, setExpandedPastSignups] = useState(new Set());

  const toggleSignupExpanded = (signupId) => {
    setCollapsedSignups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(signupId)) {
        newSet.delete(signupId);
      } else {
        newSet.add(signupId);
      }
      return newSet;
    });
  };

  const togglePastSignupExpanded = (signupId) => {
    setExpandedPastSignups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(signupId)) {
        newSet.delete(signupId);
      } else {
        newSet.add(signupId);
      }
      return newSet;
    });
  };

  const isPlayerSignedUp = (signup) => {
    if (!currentUserPlayer || !signup.players) return false;
    return signup.players.some(p => p.player_id === currentUserPlayer.id);
  };

  const getIsExpanded = (signup) => {
    if (isUpcoming) {
      // Signups are expanded by default unless manually collapsed
      return signup.players && signup.players.length > 0 && !collapsedSignups.has(signup.id);
    } else {
      return expandedPastSignups.has(signup.id);
    }
  };

  const getToggleHandler = (signupId) => {
    return isUpcoming ? () => toggleSignupExpanded(signupId) : () => togglePastSignupExpanded(signupId);
  };

  if (loading) {
    return (
      <div className="league-empty-state">
        <p>Loading signups...</p>
      </div>
    );
  }

  if (signups.length === 0) {
    return (
      <div className="league-empty-state">
        <Calendar size={40} />
        <p>
          {isUpcoming
            ? `No upcoming sessions. ${isLeagueAdmin && 'Create a session or weekly schedule to get started.'}`
            : 'No past sessions.'}
        </p>
      </div>
    );
  }

  return (
    <div className="league-signups-list">
      {signups.map(signup => {
        const isSignedUp = isPlayerSignedUp(signup);
        const isExpanded = getIsExpanded(signup);

        return (
          <div
            key={signup.id}
            className={`league-signup-row ${!signup.is_open ? 'closed' : ''} ${isUpcoming && isLeagueAdmin ? 'admin' : ''} ${!isUpcoming ? 'past' : ''}`}
          >
            <div className="league-signup-info">
              <div className="league-signup-main">
                <div className="league-signup-details">
                  <div className="league-signup-title" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <span>{formatDate(signup.scheduled_datetime)} at {formatTime(signup.scheduled_datetime)}</span>
                    {isSignedUp && (
                      <div className="signed-up-badge">
                        <div className="signed-up-dot" />
                        You're signed up
                      </div>
                    )}
                  </div>
                  <div className="league-signup-meta">
                    {isUpcoming && (
                      <>
                        <span className="league-signup-meta-item">
                          <Clock size={14} />
                          {signup.duration_hours} hours
                        </span>
                        {signup.court_id && (
                          <span className="league-signup-meta-item">
                            <MapPin size={14} />
                            Court {signup.court_id}
                          </span>
                        )}
                      </>
                    )}
                    <span className="league-signup-meta-item">
                      <Users size={14} />
                      {signup.player_count} {signup.player_count === 1 ? 'player' : 'players'}
                    </span>
                  </div>
                  {isUpcoming && !signup.is_open && (
                    <div className="league-signup-status">
                      Opens {formatDateTimeWithTimezone(signup.open_signups_at)}
                    </div>
                  )}
                </div>
                <div className="league-signup-actions">
                  {isUpcoming && isLeagueMember && signup.is_open && (
                    <button
                      className={`league-text-button ${isSignedUp ? 'danger' : 'primary'}`}
                      onClick={() => isSignedUp ? onDropout(signup.id) : onSignup(signup.id)}
                    >
                      {isSignedUp ? 'Drop Out' : 'Sign Up'}
                    </button>
                  )}
                  {isUpcoming && isLeagueAdmin && (
                    <>
                      <button
                        className="league-text-button"
                        onClick={() => onEdit(signup)}
                      >
                        <Edit2 size={14} />
                        Edit
                      </button>
                      <button
                        className="league-signup-remove"
                        onClick={() => onDelete(signup.id)}
                        title="Delete signup"
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                  {signup.players && signup.players.length > 0 && (
                    <button
                      className="league-text-button"
                      onClick={getToggleHandler(signup.id)}
                      title={isExpanded ? "Collapse players" : "Expand players"}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  )}
                </div>
              </div>
              {isExpanded && signup.players && signup.players.length > 0 && (
                <div className="league-signup-players">
                  {signup.players.map((player, idx) => {
                    const isCurrentPlayer = currentUserPlayer && player.player_id === currentUserPlayer.id;
                    return (
                      <div key={idx} className={`league-signup-player-item ${isCurrentPlayer ? 'current-player' : ''}`}>
                        <span className="league-signup-player-name">{player.player_name}</span>
                        <span className="league-signup-player-time">
                          Signed up {formatDateTimeWithTimezone(player.signed_up_at, !isUpcoming)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

