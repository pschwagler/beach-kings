'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { getAdminAllCourts, getCourtDetailById } from '../../../services/api';
import { formatDate } from '../adminUtils';
import CourtEditRow from './CourtEditRow';

/**
 * Panel to browse all courts with search, status filter, and inline editing.
 */
export default function AllCourtsPanel() {
  const [courts, setCourts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [courtDetail, setCourtDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef(null);
  const pageSize = 25;

  const load = useCallback(async (p = page, s = search, st = statusFilter) => {
    try {
      setLoading(true);
      const params = { page: p, page_size: pageSize };
      if (s) params.search = s;
      if (st && st !== 'all') params.status = st;
      const data = await getAdminAllCourts(params);
      setCourts(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Error loading courts:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    load();
  }, [page, statusFilter]);

  // Clean up debounce timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /** Debounced search — resets to page 1 on new search. */
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load(1, val, statusFilter);
    }, 400);
  };

  const handleStatusChange = (e) => {
    setStatusFilter(e.target.value);
    setPage(1);
  };

  /** Fetch full court detail (photos + reviews) when expanding a row. */
  const handleRowClick = async (courtId) => {
    if (expandedId === courtId) {
      setExpandedId(null);
      setCourtDetail(null);
      return;
    }
    setExpandedId(courtId);
    setCourtDetail(null);
    try {
      setDetailLoading(true);
      const detail = await getCourtDetailById(courtId);
      setCourtDetail(detail);
    } catch (err) {
      console.error('Error fetching court detail:', err);
      setCourtDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Called by CourtEditRow after a successful save. */
  const handleCourtUpdated = (updatedCourt) => {
    setCourts((prev) =>
      prev.map((c) =>
        c.id === updatedCourt.id ? { ...c, ...updatedCourt } : c
      )
    );
    setExpandedId(null);
    setCourtDetail(null);
  };

  const statusBadge = (status) => {
    const cls = `admin-court-status-badge admin-court-status-badge--${status || 'pending'}`;
    return <span className={cls}>{status || 'pending'}</span>;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <>
      <div className="admin-section-header">
        <h2>All Courts</h2>
        <button
          onClick={() => load()}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh courts"
          title="Refresh"
        >
          <RefreshCw size={18} className={loading ? 'spinning' : ''} />
        </button>
      </div>

      <div className="admin-courts-toolbar">
        <input
          type="text"
          className="admin-courts-search"
          placeholder="Search by name or address..."
          value={search}
          onChange={handleSearchChange}
        />
        <select
          className="admin-courts-status-select"
          value={statusFilter}
          onChange={handleStatusChange}
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? (
        <p>Loading courts...</p>
      ) : courts.length === 0 ? (
        <p>No courts found.</p>
      ) : (
        <>
          <div className="admin-feedback-table-container">
            <table className="admin-feedback-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Surface</th>
                  <th>Courts</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {courts.map((court) => (
                  <CourtRows
                    key={court.id}
                    court={court}
                    isExpanded={expandedId === court.id}
                    onRowClick={handleRowClick}
                    onCourtUpdated={handleCourtUpdated}
                    statusBadge={statusBadge}
                    courtDetail={expandedId === court.id ? courtDetail : null}
                    detailLoading={expandedId === court.id ? detailLoading : false}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="admin-courts-pagination">
              <span>Page {page} of {totalPages} ({total} total)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage((p) => p - 1)} disabled={page <= 1}>Previous</button>
                <button onClick={() => setPage((p) => p + 1)} disabled={page >= totalPages}>Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

/**
 * Renders a court summary row + optional expanded CourtEditRow below it.
 */
function CourtRows({ court, isExpanded, onRowClick, onCourtUpdated, statusBadge, courtDetail, detailLoading }) {
  return (
    <>
      <tr
        className={`admin-courts-row--clickable ${isExpanded ? 'admin-courts-row--expanded' : ''}`}
        onClick={() => onRowClick(court.id)}
      >
        <td className="feedback-text-cell">
          <div className="feedback-text">{court.name}</div>
        </td>
        <td className="feedback-text-cell">
          <div className="feedback-text">{court.address || 'N/A'}</div>
        </td>
        <td>{court.location_name || court.location_id}</td>
        <td>{statusBadge(court.status)}</td>
        <td>{court.surface_type || 'N/A'}</td>
        <td>{court.court_count || 'N/A'}</td>
        <td>{formatDate(court.created_at)}</td>
      </tr>
      {isExpanded && (
        <tr className="admin-court-edit-row">
          <td colSpan={7}>
            <CourtEditRow
              court={court}
              onSave={onCourtUpdated}
              onCancel={() => onRowClick(court.id)}
              photos={courtDetail?.court_photos || []}
              reviews={courtDetail?.reviews || []}
              detailLoading={detailLoading}
            />
          </td>
        </tr>
      )}
    </>
  );
}
