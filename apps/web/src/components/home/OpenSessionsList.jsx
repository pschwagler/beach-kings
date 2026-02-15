'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, Trophy, UserPlus, User } from 'lucide-react';
import { getOpenSessions } from '../../services/api';
import { formatDate } from '../../utils/dateUtils';

/**
 * List of open (ACTIVE) sessions where the user is creator, has a match, or is invited.
 * League sessions link to league matches tab; non-league link to /session/[code].
 */
export default function OpenSessionsList({ onSessionClick, refreshTrigger, currentUserPlayerId }) {
  const router = useRouter();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getOpenSessions();
      setSessions(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Error loading open sessions:', err);
      setError(err.message || 'Failed to load open sessions');
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshTrigger]);

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
      // Check if current user is the creator
      if (currentUserPlayerId && session.created_by === currentUserPlayerId) {
        return 'Created by you';
      }
      const name = session.created_by_name;
      return name ? `Created by ${name}` : '—';
    }
    if (session.participation === 'invited') return 'Invited';
    return 'Playing';
  };

  if (loading) {
    return (
      <div className="open-sessions-list open-sessions-list-loading">
        <p className="secondary-text">Loading open sessions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="open-sessions-list open-sessions-list-error">
        <p className="secondary-text">{error}</p>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="open-sessions-list open-sessions-list-empty">
        <Calendar size={32} className="empty-icon" />
        <p>No open sessions</p>
        <p className="empty-subtext">Start a pickup game or join a session by code to see it here.</p>
      </div>
    );
  }

  return (
    <div className="open-sessions-list">
      <ul className="open-sessions-list-ul">
        {sessions.map((session) => (
          <li key={session.id} className="open-sessions-list-item">
            <button
              type="button"
              className="open-sessions-list-card"
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
                </span>
                <span className="open-sessions-list-participation">
                  {session.participation === 'creator' && <User size={14} />}
                  {session.participation === 'invited' && <UserPlus size={14} />}
                  {session.participation === 'player' && <Trophy size={14} />}
                  {participationLabel(session)}
                </span>
              </div>
              <div className="open-sessions-list-card-right">
                <span className="open-sessions-list-count">{session.match_count ?? 0} games</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
