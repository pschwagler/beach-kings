'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAdminStats } from '../../services/api';
import { formatDate } from './adminUtils';

/**
 * Platform stats dashboard tab — shows key metrics with 30-day trends.
 */
export default function AdminDashboardTab() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="admin-stats-section">
      <div className="admin-section-header">
        <h2>Platform Stats</h2>
        <button
          onClick={loadStats}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh stats"
          title="Refresh stats"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
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
  );
}
