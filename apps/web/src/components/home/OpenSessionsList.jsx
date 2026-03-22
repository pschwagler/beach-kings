'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Trophy, UserPlus, User, MapPin } from 'lucide-react';
import { getOpenSessions } from '../../services/api';
import { formatDate } from '../../utils/dateUtils';

/**
 * Displays user's sessions (creator, has match, or invited).
 * variant="widget" (default): dashboard card with 5-item limit, scroll-expand, widget chrome.
 * variant="full": bare list — no card wrapper, no limit, all items flow on page.
 */
export function MySessionsWidget({ onSessionClick, refreshTrigger, currentUserPlayerId, onViewAll, variant = 'widget' }) {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAll, setShowAll] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const isFull = variant === 'full';

  const load = async (includeAll) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpenSessions({ includeAll });
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading sessions:', err);
      setError(err.message || 'Failed to load sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(showAll);
  }, [refreshTrigger, showAll]);

  const handleSessionClick = (session) => {
    if (onSessionClick) {
      onSessionClick(session);
      return;
    }
    if (session.league_id != null) {
      const params = new URLSearchParams();
      params.set('tab', 'matches');
      if (session.season_id != null) params.set('season', String(session.season_id));
      router.push(`/league/${session.league_id}?${params.toString()}`);
    } else if (session.code) {
      router.push(`/session/${session.code}`);
    }
  };

  const participationLabel = (session) => {
    if (session.participation === 'creator') {
      if (currentUserPlayerId && session.created_by === currentUserPlayerId) {
        return 'Created by you';
      }
      const name = session.created_by_name;
      return name ? `Created by ${name}` : '\u2014';
    }
    if (session.participation === 'invited') return 'Invited';
    if (session.league_name) return session.league_name;
    return 'Playing';
  };

  const gameCountLabel = (count) => {
    if (count === 0) return 'No games';
    if (count === 1) return '1 game';
    return `${count} games`;
  };

  const toggleBtn = (
    <button
      type="button"
      className="sessions-widget-toggle"
      onClick={() => setShowAll((prev) => !prev)}
    >
      {showAll ? 'Showing all' : 'Showing open'}
    </button>
  );

  const renderSessionCards = (list) => (
    <div className="open-sessions-list-ul">
      {list.map((session) => {
        const isActive = session.status === 'ACTIVE';
        return (
          <div key={session.id} className="open-sessions-list-item">
            <button
              type="button"
              className={`open-sessions-list-card${isActive ? ' open-sessions-list-card--active' : ''}`}
              onClick={() => handleSessionClick(session)}
            >
              <div className="open-sessions-list-card-main">
                <span className="open-sessions-list-name">{session.name || 'Session'}</span>
                <span className="open-sessions-list-meta">
                  {session.date && formatDate(session.date)}
                  {session.league_id != null ? (
                    <span className="open-sessions-list-badge league">League</span>
                  ) : (
                    <span className="open-sessions-list-badge pickup">Pickup</span>
                  )}
                  {isActive && (
                    <span className="recording-dot" />
                  )}
                </span>
                {session.court_name && (
                  <span className="open-sessions-list-court">
                    <MapPin size={14} />
                    {session.court_slug && !session.court_slug.startsWith('other-private-') ? (
                      <a
                        href={`/courts/${session.court_slug}`}
                        className="open-sessions-list-court-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {session.court_name}
                      </a>
                    ) : (
                      session.court_name
                    )}
                  </span>
                )}
                <span className="open-sessions-list-participation">
                  {session.participation === 'creator' && <User size={14} />}
                  {session.participation === 'invited' && <UserPlus size={14} />}
                  {session.participation === 'player' && <Trophy size={14} />}
                  {participationLabel(session)}
                </span>
              </div>
              <div className="open-sessions-list-card-right">
                <span className="open-sessions-list-count">
                  {gameCountLabel(session.user_match_count ?? session.match_count ?? 0)}
                </span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );

  const renderEmpty = () => (
    <div className="dashboard-empty-state">
      <Calendar size={40} className="empty-state-icon" />
      <p>No sessions found</p>
      <p className="empty-state-text">Start a pickup game or join a session to see it here.</p>
    </div>
  );

  // --- Full variant: bare list, no widget chrome ---
  if (isFull) {
    const title = (
      <div className="my-games-tab-section-title">
        <Calendar size={18} />
        My Sessions
        {toggleBtn}
      </div>
    );

    if (loading) {
      return <div>{title}<p className="secondary-text">Loading sessions...</p></div>;
    }
    if (error) {
      return <div>{title}<p className="secondary-text">{error}</p></div>;
    }
    if (!sessions || sessions.length === 0) {
      return <div>{title}{renderEmpty()}</div>;
    }
    return (
      <div>
        {title}
        {renderSessionCards(sessions)}
      </div>
    );
  }

  // --- Widget variant: dashboard card with header ---
  const titleElement = onViewAll ? (
    <h3
      className="dashboard-widget-title dashboard-widget-title--clickable"
      onClick={onViewAll}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onViewAll(); } }}
    >
      My Sessions
    </h3>
  ) : (
    <h3 className="dashboard-widget-title">My Sessions</h3>
  );

  const header = (
    <div className="dashboard-widget-header">
      <div className="dashboard-widget-header-title">
        <Calendar size={20} />
        {titleElement}
      </div>
      <div className="dashboard-widget-header-actions">
        {toggleBtn}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="dashboard-widget">
        {header}
        <div className="dashboard-widget-content">
          <p className="secondary-text">Loading sessions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-widget">
        {header}
        <div className="dashboard-widget-content">
          <p className="secondary-text">{error}</p>
        </div>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="dashboard-widget">
        {header}
        <div className="dashboard-widget-content">
          {renderEmpty()}
        </div>
      </div>
    );
  }

  const visibleSessions = expanded ? sessions : sessions.slice(0, 5);

  return (
    <div className="dashboard-widget">
      {header}
      <div className="dashboard-widget-content">
        <div className={expanded ? 'open-sessions-list-expanded' : ''}>
          {renderSessionCards(visibleSessions)}
        </div>
        {sessions.length > 5 && (
          <div
            className="dashboard-widget-footer dashboard-widget-footer-clickable"
            onClick={() => setExpanded(!expanded)}
          >
            <p className="secondary-text">
              {expanded
                ? 'Show less'
                : `+${sessions.length - 5} more session${sessions.length - 5 !== 1 ? 's' : ''}`
              }
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MySessionsWidget;
