'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw, ChevronUp, ChevronDown, Camera } from 'lucide-react';
import { getAdminAllCourts, getCourtDetailById } from '../../../services/api';
import { formatDate } from '../adminUtils';
import CourtEditRow from './CourtEditRow';

/** Column definitions for the sortable table. */
const COLUMNS = [
  { key: 'name', label: 'Name', sortable: true },
  { key: 'address', label: 'Address', sortable: false },
  { key: 'location', label: 'Location', sortable: false },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'surface_type', label: 'Surface', sortable: true },
  { key: 'court_count', label: 'Courts', sortable: true },
  { key: 'photos', label: 'Photos', sortable: false },
  { key: 'created_at', label: 'Created', sortable: true },
];

/**
 * Panel to browse all courts with search, filters, column sorting, and inline editing.
 */
export default function AllCourtsPanel() {
  const [courts, setCourts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [surfaceFilter, setSurfaceFilter] = useState('all');
  const [photosFilter, setPhotosFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedId, setExpandedId] = useState(null);
  const [courtDetail, setCourtDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef(null);
  const pageSize = 25;

  const load = useCallback(async (overrides = {}) => {
    const p = overrides.page ?? page;
    const s = overrides.search ?? search;
    const st = overrides.statusFilter ?? statusFilter;
    const sf = overrides.surfaceFilter ?? surfaceFilter;
    const pf = overrides.photosFilter ?? photosFilter;
    const sb = overrides.sortBy ?? sortBy;
    const sd = overrides.sortDir ?? sortDir;

    try {
      setLoading(true);
      const params = { page: p, page_size: pageSize, sort_by: sb, sort_dir: sd };
      if (s) params.search = s;
      if (st && st !== 'all') params.status = st;
      if (sf && sf !== 'all') params.surface_type = sf;
      if (pf === 'yes') params.has_photos = true;
      else if (pf === 'no') params.has_photos = false;
      const data = await getAdminAllCourts(params);
      setCourts(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Error loading courts:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, surfaceFilter, photosFilter, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [page, statusFilter, surfaceFilter, photosFilter, sortBy, sortDir]);

  // Clean up debounce timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /** Debounced search — resets to page 1 on new search. */
  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ page: 1, search: val });
    }, 400);
  };

  /** Generic filter change handler — resets to page 1. */
  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  /** Toggle sort column or flip direction. */
  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortDir('asc');
    }
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
      const detail = await getCourtDetailById(courtId, { bustCache: true });
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

  /** Render sort indicator arrow for a column header. */
  const SortIcon = ({ columnKey }) => {
    if (sortBy !== columnKey) return null;
    return sortDir === 'asc'
      ? <ChevronUp size={14} className="admin-sort-icon" />
      : <ChevronDown size={14} className="admin-sort-icon" />;
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
          onChange={handleFilterChange(setStatusFilter)}
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
        <select
          className="admin-courts-status-select"
          value={surfaceFilter}
          onChange={handleFilterChange(setSurfaceFilter)}
          aria-label="Filter by surface"
        >
          <option value="all">All surfaces</option>
          <option value="sand">Sand</option>
          <option value="indoor_sand">Indoor Sand</option>
          <option value="grass">Grass</option>
          <option value="hard">Hard Court</option>
        </select>
        <select
          className="admin-courts-status-select"
          value={photosFilter}
          onChange={handleFilterChange(setPhotosFilter)}
          aria-label="Filter by photos"
        >
          <option value="all">All photos</option>
          <option value="yes">Has photos</option>
          <option value="no">No photos</option>
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
                  {COLUMNS.map(({ key, label, sortable }) => (
                    <th
                      key={key}
                      className={sortable ? 'admin-th--sortable' : ''}
                      onClick={sortable ? () => handleSort(key) : undefined}
                      aria-sort={sortBy === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {label}
                      {sortable && <SortIcon columnKey={key} />}
                    </th>
                  ))}
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
        <td>
          {court.photo_count > 0 ? (
            <span className="admin-court-photo-count">
              <Camera size={13} /> {court.photo_count}
            </span>
          ) : (
            <span className="admin-court-photo-count admin-court-photo-count--none">0</span>
          )}
        </td>
        <td>{formatDate(court.created_at)}</td>
      </tr>
      {isExpanded && (
        <tr className="admin-court-edit-row">
          <td colSpan={8}>
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
