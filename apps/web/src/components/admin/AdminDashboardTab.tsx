'use client';

import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, User, UserX, UserPlus } from 'lucide-react';
import { getAdminStats, getAdminRecentPlayers } from '../../services/api';
import { formatDate } from './adminUtils';

interface AdminStatEntry {
  label: string;
  total: number;
  last_30_days: number;
}

interface AdminStats {
  stats: AdminStatEntry[];
  generated_at: string;
}

interface AdminPlayer {
  id: number;
  full_name: string;
  is_placeholder: boolean;
  has_user: boolean;
  auth_provider?: string | null;
  created_at: string;
}

/**
 * Platform stats dashboard tab — shows key metrics with 30-day trends
 * and a table of recently created players.
 */
export default function AdminDashboardTab(): React.ReactNode {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [players, setPlayers] = useState<AdminPlayer[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [includeUnregistered, setIncludeUnregistered] = useState(false);

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

  const loadPlayers = useCallback(async (withUnregistered: boolean) => {
    try {
      setPlayersLoading(true);
      const data = await getAdminRecentPlayers(50, withUnregistered);
      setPlayers(data);
    } catch (err) {
      console.error('Error loading recent players:', err);
    } finally {
      setPlayersLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    loadPlayers(includeUnregistered);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {/* Platform Stats */}
      <div className="admin-stats-section">
        <div className="admin-section-header">
          <h2>Platform Stats</h2>
          <button
            onClick={() => { loadStats(); loadPlayers(includeUnregistered); }}
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
        <div className="admin-recent-players-header">
          <h2 className="admin-recent-players-section__title">Recent Players</h2>
          <label className="admin-toggle-label">
            <input
              type="checkbox"
              checked={includeUnregistered}
              onChange={(e) => {
                const next = e.target.checked;
                setIncludeUnregistered(next);
                loadPlayers(next);
              }}
              className="admin-toggle-checkbox"
            />
            <span>Include unregistered</span>
          </label>
        </div>
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
                    <td style={{ fontWeight: 600, color: 'var(--gray-900)' }}>
                      {p.full_name}
                      {p.is_placeholder && (
                        <span className="admin-player-badge admin-player-badge--placeholder">
                          <UserPlus size={13} /> Placeholder
                        </span>
                      )}
                    </td>
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
