'use client';

import { useState, useEffect, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAdminFeedback, updateFeedbackResolution } from '../../services/api';
import { formatDate } from './adminUtils';

/**
 * Admin feedback tab — searchable table with resolve toggles.
 */
export default function AdminFeedbackTab() {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(false);

  const loadFeedback = async () => {
    try {
      setLoading(true);
      const data = await getAdminFeedback();
      setFeedback(data);
    } catch (err) {
      console.error('Error loading feedback:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeedback();
  }, []);

  const handleToggleResolved = async (feedbackId, currentStatus) => {
    try {
      const updated = await updateFeedbackResolution(feedbackId, !currentStatus);
      setFeedback((prev) => prev.map((item) => (item.id === feedbackId ? updated : item)));
    } catch (err) {
      console.error('Error updating feedback resolution:', err);
    }
  };

  const filtered = useMemo(() => {
    return feedback.filter((item) => {
      if (showUnresolvedOnly && item.is_resolved) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const matches =
          item.feedback_text.toLowerCase().includes(s) ||
          (item.user_name && item.user_name.toLowerCase().includes(s)) ||
          (item.email && item.email.toLowerCase().includes(s)) ||
          item.id.toString().includes(s);
        if (!matches) return false;
      }
      return true;
    });
  }, [feedback, search, showUnresolvedOnly]);

  return (
    <div className="admin-feedback-section" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
      <div className="admin-section-header">
        <h2>Feedback</h2>
        <button
          onClick={loadFeedback}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh feedback"
          title="Refresh feedback"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="admin-feedback-filters">
        <div className="feedback-filter-group">
          <input
            type="text"
            placeholder="Search feedback, user, email, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="feedback-search-input"
          />
        </div>
        <div className="feedback-filter-group">
          <label className="feedback-filter-checkbox">
            <input
              type="checkbox"
              checked={showUnresolvedOnly}
              onChange={(e) => setShowUnresolvedOnly(e.target.checked)}
            />
            <span>Show unresolved only</span>
          </label>
        </div>
      </div>

      {loading ? (
        <p>Loading feedback...</p>
      ) : feedback.length === 0 ? (
        <p>No feedback submitted yet.</p>
      ) : filtered.length === 0 ? (
        <p>No feedback matches your filters.</p>
      ) : (
        <div className="admin-feedback-table-container">
          <table className="admin-feedback-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>User</th>
                <th>Email</th>
                <th>Status</th>
                <th>Resolved</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className={item.is_resolved ? 'resolved' : ''}>
                  <td>{item.id}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>{item.user_name || (item.user_id ? `User ${item.user_id}` : 'Anonymous')}</td>
                  <td>{item.email || 'N/A'}</td>
                  <td>
                    <span className={`feedback-status ${item.is_resolved ? 'resolved' : 'pending'}`}>
                      {item.is_resolved ? 'Resolved' : 'Pending'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="feedback-resolve-toggle"
                      onClick={() => handleToggleResolved(item.id, item.is_resolved)}
                      aria-label={item.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                      title={item.is_resolved ? 'Mark as unresolved' : 'Mark as resolved'}
                    >
                      <span className={`toggle-switch ${item.is_resolved ? 'active' : ''}`} />
                    </button>
                  </td>
                  <td className="feedback-text-cell">
                    <div className="feedback-text">{item.feedback_text}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
