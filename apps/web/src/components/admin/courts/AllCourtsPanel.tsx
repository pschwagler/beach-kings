'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RefreshCw, ChevronUp, ChevronDown, ChevronRight, Camera, MapPin, Search, SlidersHorizontal, X } from 'lucide-react';
import { getAdminAllCourts, getCourtDetailById } from '../../../services/api';
import { useApp } from '../../../contexts/AppContext';
import { formatDate } from '../adminUtils';
import CourtEditRow, { type AdminCourt, type CourtPhoto, type CourtReview } from './CourtEditRow';
import type { Court, Location } from '../../../types';

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

function humanizeRegionId(regionId: string) {
  return regionId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** Build stable region options even when the locations API omits region_name. */
export function getAdminCourtRegions(locations: Location[]) {
  const map = new Map<string, string>();
  locations.forEach((location) => {
    const regionId = location.region_id;
    if (!regionId || map.has(regionId)) return;
    const name = location.region_name?.trim()
      || location.region?.trim()
      || humanizeRegionId(regionId);
    map.set(regionId, name);
  });
  return Array.from(map, ([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Panel to browse all courts with search, filters, column sorting, and inline editing.
 */
export default function AllCourtsPanel() {
  const { locations } = useApp();
  const [courts, setCourts] = useState<Court[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [surfaceFilter, setSurfaceFilter] = useState('all');
  const [photosFilter, setPhotosFilter] = useState('all');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedId, setExpandedId] = useState<number | string | null>(null);
  const [courtDetail, setCourtDetail] = useState<Court | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = 25;

  /** Derive unique regions from locations. */
  const regions = useMemo(() => getAdminCourtRegions(locations), [locations]);

  /** Filter locations by selected region. */
  const filteredLocations = useMemo(() => {
    if (regionFilter === 'all') return locations;
    return locations.filter((loc) => loc.region_id === regionFilter);
  }, [locations, regionFilter]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string | number | boolean> = {
        page,
        page_size: pageSize,
        sort_by: sortBy,
        sort_dir: sortDir,
      };
      if (search) params.search = search;
      if (locationFilter !== 'all') params.location_id = locationFilter;
      else if (regionFilter !== 'all') params.region_id = regionFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (surfaceFilter !== 'all') params.surface_type = surfaceFilter;
      if (photosFilter !== 'all') params.has_photos = photosFilter === 'yes';
      const data = await getAdminAllCourts(params);
      setCourts(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error('Error loading courts:', err);
      setError('Could not load the court directory. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [page, search, regionFilter, locationFilter, statusFilter, surfaceFilter, photosFilter, sortBy, sortDir]);

  useEffect(() => {
    void load();
  }, [load]);

  // Clean up debounce timer on unmount
  useEffect(() => () => clearTimeout(debounceRef.current ?? undefined), []);

  /** Debounced search — resets to page 1 on new search. */
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(debounceRef.current ?? undefined);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      setSearch(val.trim());
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

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setRegionFilter('all');
    setLocationFilter('all');
    setStatusFilter('all');
    setSurfaceFilter('all');
    setPhotosFilter('all');
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
    setCourtDetail((current) => (
      current?.id === updatedCourt.id ? { ...current, ...updatedCourt } as Court : current
    ));
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
  const activeFilterCount = [search, regionFilter, locationFilter, statusFilter, surfaceFilter, photosFilter]
    .filter((value, index) => index === 0 ? Boolean(value) : value !== 'all').length;

  return (
    <>
      <div className="admin-section-header admin-section-header--court">
        <div>
          <span className="admin-section-eyebrow">Published data</span>
          <h3>All courts</h3>
          <p>Search the full directory, check publication status, and edit any venue in place.</p>
        </div>
        <button
          onClick={() => load()}
          disabled={loading}
          className="admin-refresh-btn"
          aria-label="Refresh court directory"
        >
          <RefreshCw size={16} className={loading ? 'spinning' : ''} /> Refresh
        </button>
      </div>

      <div className="admin-courts-toolbar">
        <label className="admin-courts-search-wrap">
          <span>Search courts</span>
          <div><Search size={16} /><input type="search" className="admin-courts-search" placeholder="Name or address" value={searchInput} onChange={handleSearchChange} /></div>
        </label>
        <label>
          <span>Status</span>
          <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }} aria-label="Filter by status">
            <option value="all">Any status</option><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option>
          </select>
        </label>
        <label>
          <span>Surface</span>
          <select value={surfaceFilter} onChange={(event) => { setSurfaceFilter(event.target.value); setPage(1); }} aria-label="Filter by surface">
            <option value="all">Any surface</option><option value="sand">Sand</option><option value="indoor_sand">Indoor sand</option><option value="grass">Grass</option><option value="hard">Hard court</option>
          </select>
        </label>
        <label>
          <span>Photos</span>
          <select value={photosFilter} onChange={(event) => { setPhotosFilter(event.target.value); setPage(1); }} aria-label="Filter by photos">
            <option value="all">With or without</option><option value="yes">Has photos</option><option value="no">No photos</option>
          </select>
        </label>
        <label>
          <span>Region</span>
          <select value={regionFilter} onChange={handleRegionChange} aria-label="Filter by region">
            <option value="all">All regions</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label>
          <span>Location</span>
          <select value={locationFilter} onChange={handleLocationChange} aria-label="Filter by location">
            <option value="all">All locations</option>
            {filteredLocations.map((loc) => (
              <option key={loc.id} value={loc.id}>
                {loc.name || [loc.city, loc.state].filter(Boolean).join(', ') || loc.id}
              </option>
            ))}
          </select>
        </label>
        {activeFilterCount > 0 && <button type="button" className="admin-courts-clear" onClick={clearFilters}><X size={14} /> Clear {activeFilterCount}</button>}
      </div>

      <div className="admin-courts-results-bar">
        <span><SlidersHorizontal size={14} /> {total === 0 ? 'No courts' : `${total} ${total === 1 ? 'court' : 'courts'}`}</span>
        {loading && <span><RefreshCw size={13} className="spinning" /> Updating…</span>}
      </div>

      {error ? (
        <div className="admin-courts-alert admin-courts-alert--error" role="alert">{error} <button type="button" onClick={() => load()}>Try again</button></div>
      ) : loading && courts.length === 0 ? (
        <div className="admin-courts-loading"><RefreshCw size={20} className="spinning" /> Loading court directory…</div>
      ) : courts.length === 0 ? (
        <div className="admin-courts-empty"><MapPin size={28} /><strong>No courts match these filters</strong><span>Broaden your search or clear the filters to see the full directory.</span>{activeFilterCount > 0 && <button type="button" onClick={clearFilters}>Clear filters</button>}</div>
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
                      aria-sort={sortBy === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
                      {sortable ? <button type="button" className="admin-sort-button" onClick={() => handleSort(key)}>{label}<SortIcon columnKey={key} /></button> : label}
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
              <div className="admin-courts-pagination-actions">
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
          <button
            type="button"
            className="admin-court-row-trigger"
            onClick={(event) => { event.stopPropagation(); onRowClick(court.id); }}
            aria-expanded={isExpanded}
          >
            <ChevronRight size={15} className={isExpanded ? 'is-open' : ''} />
            <span>{court.name}</span>
          </button>
        </td>
        <td className="feedback-text-cell">
          <div className="feedback-text">{court.address || 'N/A'}</div>
        </td>
        <td>{court.location_name || court.location_id}</td>
        <td>{statusBadge(court.status ?? undefined)}</td>
        <td>{court.surface_type?.replace(/_/g, ' ') || 'N/A'}</td>
        <td>{court.court_count ?? 'N/A'}</td>
        <td>
          {(court.photo_count ?? 0) > 0 ? (
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
