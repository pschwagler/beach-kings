'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, User, UserX } from 'lucide-react';
import { getAdminStats, getAdminRecentPlayers } from '../../services/api';
import { formatDate } from './adminUtils';

/**
 * Platform stats dashboard tab — shows key metrics with 30-day trends
 * and a table of recently created players.
 */
export default function AdminDashboardTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState([]);
  const [playersLoading, setPlayersLoading] = useState(false);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getAdminStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading platform stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPlayers = async () => {
    try {
      setPlayersLoading(true);
      const data = await getAdminRecentPlayers(50);
      setPlayers(data);
    } catch (err) {
      console.error('Error loading recent players:', err);
    } finally {
      setPlayersLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    loadPlayers();
  }, []);

  return (
    <>
      {/* Platform Stats */}
      <div className="admin-stats-section">
        <div className="admin-section-header">
          <h2>Platform Stats</h2>
          <button
            onClick={() => { loadStats(); loadPlayers(); }}
            disabled={loading || playersLoading}
            className="admin-refresh-btn"
            aria-label="Refresh stats"
            title="Refresh stats"
          >
            <RefreshCw size={18} className={loading || playersLoading ? 'spinning' : ''} />
          </button>
        </div>
        {loading && !stats ? (
          <p>Loading stats...</p>
        ) : stats ? (
          <>
            <div className="admin-stats-grid">
              {stats.stats.map((s) => (
                <div key={s.label} className="admin-stats-card">
                  <div className="admin-stats-card__value">{s.total.toLocaleString()}</div>
                  <div className="admin-stats-card__label">{s.label}</div>
                  <div className="admin-stats-card__recent">+{s.last_30_days.toLocaleString()} last 30d</div>
                </div>
              ))}
            </div>
            <p className="admin-stats-timestamp">
              Cached {formatDate(stats.generated_at)}
            </p>
          </>
        ) : null}
      </div>

      {/* Recent Players */}
      <div className="admin-recent-players-section">
        <h2 className="admin-recent-players-section__title">Recent Players</h2>
        {playersLoading && players.length === 0 ? (
          <p>Loading players...</p>
        ) : players.length > 0 ? (
          <div className="admin-feedback-table-container">
            <table className="admin-feedback-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Has Account</th>
                  <th>Auth</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>{p.full_name}</td>
                    <td>
                      {p.has_user ? (
                        <span className="admin-player-badge admin-player-badge--user">
                          <User size={13} /> User
                        </span>
                      ) : (
                        <span className="admin-player-badge admin-player-badge--no-user">
                          <UserX size={13} /> No account
                        </span>
                      )}
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{p.auth_provider || '—'}</td>
                    <td>{formatDate(p.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No players found.</p>
        )}
      </div>
    </>
  );
}
