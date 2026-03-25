'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, ChevronUp, ChevronDown, Camera } from 'lucide-react';
import { getAdminAllCourts, getCourtDetailById } from '../../../services/api';
import { useApp } from '../../../contexts/AppContext';
import { formatDate } from '../adminUtils';
import CourtEditRow, { type AdminCourt, type CourtPhoto, type CourtReview } from './CourtEditRow';
import { Court } from '../../../types';

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
  const { locations } = useApp();
  const [courts, setCourts] = useState<Court[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [courtDetail, setCourtDetail] = useState<Court | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 25;

  /** Derive unique regions from locations. */
  const regions = useMemo(() => {
    const map = new Map();
    locations.forEach((loc) => {
      if (loc.region_id && !map.has(loc.region_id)) {
        map.set(loc.region_id, loc.region_name);
      }
    });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [locations]);

  /** Filter locations by selected region. */
  const filteredLocations = useMemo(() => {
    if (regionFilter === 'all') return locations;
    return locations.filter((loc) => loc.region_id === regionFilter);
  }, [locations, regionFilter]);

  const load = useCallback(async (overrides: Record<string, string | number> = {}) => {
    const p = overrides.page ?? page;
    const s = overrides.search ?? search;
    const rf = overrides.regionFilter ?? regionFilter;
    const lf = overrides.locationFilter ?? locationFilter;
    const sb = overrides.sortBy ?? sortBy;
    const sd = overrides.sortDir ?? sortDir;

    try {
      setLoading(true);
      const params: Record<string, string | number> = { page: p, page_size: pageSize, sort_by: sb, sort_dir: sd };
      if (s) params.search = s;
      if (lf && lf !== 'all') params.location_id = lf;
      else if (rf && rf !== 'all') params.region_id = rf;
      const data = await getAdminAllCourts(params);
      setCourts(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Error loading courts:', err);
    } finally {
      setLoading(false);
    }
  }, [page, search, regionFilter, locationFilter, sortBy, sortDir]);

  useEffect(() => {
    load();
  }, [load, page, regionFilter, locationFilter, sortBy, sortDir]);

  // Clean up debounce timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /** Debounced search — resets to page 1 on new search. */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      load({ page: 1, search: val });
    }, 400);
  };

  /** Region change — resets location filter and page. */
  const handleRegionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setRegionFilter(e.target.value);
    setLocationFilter('all');
    setPage(1);
  };

  /** Location change — resets page. */
  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLocationFilter(e.target.value);
    setPage(1);
  };

  /** Toggle sort column or flip direction. */
  const handleSort = (columnKey: string) => {
    if (sortBy === columnKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortDir('asc');
    }
    setPage(1);
  };

  /** Fetch full court detail (photos + reviews) when expanding a row. */
  const handleRowClick = async (courtId: number | string) => {
    if (expandedId === courtId) {
      setExpandedId(null);
      setCourtDetail(null);
      return;
    }
    setExpandedId(courtId);
    setCourtDetail(null);
    try {
      setDetailLoading(true);
      const detail = await getCourtDetailById(courtId as number, { bustCache: true });
      setCourtDetail(detail);
    } catch (err) {
      console.error('Error fetching court detail:', err);
      setCourtDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  /** Called by CourtEditRow after a successful save. */
  const handleCourtUpdated = (updatedCourt: AdminCourt) => {
    setCourts((prev) =>
      prev.map((c) =>
        c.id === updatedCourt.id ? { ...c, ...(updatedCourt as Partial<Court>) } : c
      )
    );
    setExpandedId(null);
    setCourtDetail(null);
  };

  const statusBadge = (status: string | undefined) => {
    const cls = `admin-court-status-badge admin-court-status-badge--${status || 'pending'}`;
    return <span className={cls}>{status || 'pending'}</span>;
  };

  /** Render sort indicator arrow for a column header. */
  const SortIcon = ({ columnKey }: { columnKey: string }) => {
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
          value={regionFilter}
          onChange={handleRegionChange}
          aria-label="Filter by region"
        >
          <option value="all">All regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
        <select
          className="admin-courts-status-select"
          value={locationFilter}
          onChange={handleLocationChange}
          aria-label="Filter by location"
        >
          <option value="all">All locations</option>
          {filteredLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>{loc.name}</option>
          ))}
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
interface CourtRowsProps {
  court: Court;
  isExpanded: boolean;
  onRowClick: (id: number | string) => void;
  onCourtUpdated: (court: AdminCourt) => void;
  statusBadge: (status: string | undefined) => React.ReactElement;
  courtDetail: Court | null;
  detailLoading: boolean;
}

function CourtRows({ court, isExpanded, onRowClick, onCourtUpdated, statusBadge, courtDetail, detailLoading }: CourtRowsProps) {
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
              court={court as AdminCourt}
              onSave={onCourtUpdated}
              onCancel={() => onRowClick(court.id)}
              photos={(courtDetail?.court_photos || []) as CourtPhoto[]}
              reviews={(courtDetail?.reviews || []) as CourtReview[]}
              detailLoading={detailLoading}
            />
          </td>
        </tr>
      )}
    </>
  );
}
