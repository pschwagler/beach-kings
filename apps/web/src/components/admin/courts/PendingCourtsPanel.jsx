'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { getAdminPendingCourts, adminApproveCourt, adminRejectCourt } from '../../../services/api';
import { formatDate } from '../adminUtils';

/**
 * Panel showing pending court submissions with approve/reject actions.
 * Extracted from the original AdminView court submissions section.
 */
export default function PendingCourtsPanel({ onCountChange }) {
  const [courts, setCourts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await getAdminPendingCourts();
      setCourts(data);
      onCountChange?.(data.length);
    } catch (err) {
      console.error('Error loading pending courts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleAction = async (courtId, action) => {
    setActionId(courtId);
    try {
      if (action === 'approve') {
        await adminApproveCourt(courtId);
      } else {
        await adminRejectCourt(courtId);
      }
      setCourts((prev) => {
        const next = prev.filter((c) => c.id !== courtId);
        onCountChange?.(next.length);
        return next;
      });
    } catch (err) {
      console.error(`Error ${action}ing court:`, err);
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <div className="admin-section-header">
        <h2>Pending Submissions</h2>
        <button
          onClick={load}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh pending courts"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      {loading ? (
        <p>Loading pending courts...</p>
      ) : courts.length === 0 ? (
        <p>No pending court submissions.</p>
      ) : (
        <div className="admin-feedback-table-container">
          <table className="admin-feedback-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Address</th>
                <th>Submitted</th>
                <th>Surface</th>
                <th>Courts</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {courts.map((court) => (
                <tr key={court.id}>
                  <td>{court.id}</td>
                  <td className="feedback-text-cell">
                    <div className="feedback-text">{court.name}</div>
                  </td>
                  <td className="feedback-text-cell">
                    <div className="feedback-text">{court.address || 'N/A'}</div>
                  </td>
                  <td>{formatDate(court.created_at)}</td>
                  <td>{court.surface_type || 'N/A'}</td>
                  <td>{court.court_count || 'N/A'}</td>
                  <td>
                    <div className="admin-court-actions">
                      <button
                        className="admin-court-action-btn admin-court-action-btn--approve"
                        onClick={() => handleAction(court.id, 'approve')}
                        disabled={actionId === court.id}
                        aria-label="Approve court"
                        title="Approve"
                      >
                        <CheckCircle size={16} />
                      </button>
                      <button
                        className="admin-court-action-btn admin-court-action-btn--reject"
                        onClick={() => handleAction(court.id, 'reject')}
                        disabled={actionId === court.id}
                        aria-label="Reject court"
                        title="Reject"
                      >
                        <XCircle size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
