'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { getPublicCourts, getPublicLocations } from '../../services/api';
import { useUserPosition } from '../../hooks/useUserPosition';
import CourtCard from './CourtCard';
import { Button } from '../ui/UI';
import './CourtListView.css';

const SURFACE_OPTIONS = [
  { value: '', label: 'All Surfaces' },
  { value: 'sand', label: 'Sand' },
  { value: 'grass', label: 'Grass' },
  { value: 'indoor_sand', label: 'Indoor Sand' },
];

/**
 * Filterable, paginated court list for the directory page.
 *
 * Requests browser geolocation on mount. When available (or provided via
 * userLocation prop), passes user_lat/user_lng to the API so results are
 * sorted by distance (nearest first).
 *
 * @param {Object} props
 * @param {Array} [props.initialCourts] - SSR-prefetched courts
 * @param {number} [props.initialTotal] - SSR total count
 * @param {string} [props.locationId] - Pre-filter by location hub
 * @param {Object} [props.userLocation] - { latitude, longitude } fallback from player profile
 */
export default function CourtListView({ initialCourts, initialTotal, locationId, userLocation }) {
  const { position: userPos } = useUserPosition(userLocation);

  const [courts, setCourts] = useState(initialCourts?.items || []);
  const [totalCount, setTotalCount] = useState(initialTotal || initialCourts?.total_count || 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Location options for dropdown
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(locationId || '');

  // Filters
  const [search, setSearch] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [isFree, setIsFree] = useState(null);
  const [minRating, setMinRating] = useState(null);

  const PAGE_SIZE = 20;

  // Load location options for filter dropdown
  useEffect(() => {
    getPublicLocations()
      .then((data) => {
        const flat = (data.regions || [])
          .flatMap((r) => (r.locations || []).map((loc) => ({
            id: loc.id,
            label: [loc.city, loc.state].filter(Boolean).join(', ') || loc.name,
          })))
          .sort((a, b) => a.label.localeCompare(b.label));
        setLocations(flat);
      })
      .catch(() => {}); // silently fail — dropdown just won't show options
  }, []);

  const fetchCourts = useCallback(async (pageNum = 1, resetList = true) => {
    setLoading(true);
    try {
      const filters = { page: pageNum, page_size: PAGE_SIZE };
      if (selectedLocationId) filters.location_id = selectedLocationId;
      if (search.trim()) filters.search = search.trim();
      if (surfaceType) filters.surface_type = surfaceType;
      if (isFree !== null) filters.is_free = isFree;
      if (minRating) filters.min_rating = minRating;
      if (userPos) {
        filters.user_lat = userPos.latitude;
        filters.user_lng = userPos.longitude;
      }

      const data = await getPublicCourts(filters);
      if (resetList) {
        setCourts(data.items || []);
      } else {
        setCourts((prev) => [...prev, ...(data.items || [])]);
      }
      setTotalCount(data.total_count || 0);
      setPage(pageNum);
    } catch (err) {
      console.error('Error fetching courts:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedLocationId, search, surfaceType, isFree, minRating, userPos]);

  // Refetch when filters or user position change
  useEffect(() => {
    fetchCourts(1, true);
  }, [fetchCourts]);

  const handleLoadMore = () => fetchCourts(page + 1, false);
  const hasMore = courts.length < totalCount;

  const handleClearFilters = () => {
    setSearch('');
    setSelectedLocationId('');
    setSurfaceType('');
    setIsFree(null);
    setMinRating(null);
  };

  const activeFilterCount = [
    search.trim(),
    selectedLocationId,
    surfaceType,
    isFree !== null,
    minRating,
  ].filter(Boolean).length;

  return (
    <div className="court-list">
      {/* Search + filter bar */}
      <div className="court-list__toolbar">
        <div className="court-list__search">
          <Search size={16} className="court-list__search-icon" />
          <input
            type="text"
            placeholder="Search courts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="court-list__search-input"
          />
        </div>
        <button
          className={`court-list__filter-toggle${activeFilterCount ? ' court-list__filter-toggle--active' : ''}`}
          onClick={() => setShowFilters(!showFilters)}
          aria-expanded={showFilters}
          aria-label="Toggle filters"
        >
          <SlidersHorizontal size={16} />
          Filters
          {activeFilterCount > 0 && (
            <span className="court-list__filter-badge">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Collapsible filter panel */}
      {showFilters && (
        <div className="court-list__filters">
          {locations.length > 0 && (
            <div className="court-list__filter-group">
              <label className="court-list__filter-label">Location</label>
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="court-list__filter-select"
              >
                <option value="">All Locations</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.label}</option>
                ))}
              </select>
            </div>
          )}

          <div className="court-list__filter-group">
            <label className="court-list__filter-label">Surface</label>
            <select
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
              className="court-list__filter-select"
            >
              {SURFACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="court-list__filter-group">
            <label className="court-list__filter-label">Cost</label>
            <select
              value={isFree === null ? '' : isFree ? 'true' : 'false'}
              onChange={(e) => setIsFree(e.target.value === '' ? null : e.target.value === 'true')}
              className="court-list__filter-select"
            >
              <option value="">All</option>
              <option value="true">Free</option>
              <option value="false">Paid</option>
            </select>
          </div>

          <div className="court-list__filter-group">
            <label className="court-list__filter-label">Min Rating</label>
            <select
              value={minRating || ''}
              onChange={(e) => setMinRating(e.target.value ? parseFloat(e.target.value) : null)}
              className="court-list__filter-select"
            >
              <option value="">Any</option>
              <option value="4">4+ Stars</option>
              <option value="3">3+ Stars</option>
              <option value="2">2+ Stars</option>
            </select>
          </div>

          {activeFilterCount > 0 && (
            <button className="court-list__clear-filters" onClick={handleClearFilters}>
              <X size={14} /> Clear All
            </button>
          )}
        </div>
      )}

      {/* Results count */}
      <div className="court-list__count">
        {totalCount} court{totalCount !== 1 ? 's' : ''} found
        {userPos && <span className="court-list__count-hint"> · sorted by distance</span>}
      </div>

      {/* Grid */}
      <div className="court-list__grid">
        {courts.map((court) => (
          <CourtCard key={court.id} court={court} />
        ))}
      </div>

      {courts.length === 0 && !loading && (
        <div className="court-list__empty">
          <h3>No courts found</h3>
          <p>Try adjusting your filters or search terms.</p>
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="court-list__load-more">
          <Button onClick={handleLoadMore} disabled={loading} variant="outline">
            {loading ? 'Loading...' : 'Load More'}
          </Button>
        </div>
      )}
    </div>
  );
}
