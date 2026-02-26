'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { getPublicCourts, getPublicLocations } from '../../services/api';
import { useUserPosition } from '../../hooks/useUserPosition';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import CourtCard from './CourtCard';
import { Button } from '../ui/UI';
import { SURFACE_OPTIONS } from '../../constants/court';
import './CourtListView.css';

const SURFACE_FILTER_OPTIONS = [
  { value: '', label: 'All Surfaces' },
  ...SURFACE_OPTIONS,
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
 * @param {string} [props.userLocationId] - Authenticated user's location_id for sorting
 * @param {Object} [props.userLocation] - { latitude, longitude } fallback from player profile
 */
export default function CourtListView({ initialCourts, initialTotal, locationId, userLocationId, userLocation }) {
  const { position: userPos } = useUserPosition(userLocation);

  const [courts, setCourts] = useState(initialCourts?.items || []);
  const [totalCount, setTotalCount] = useState(initialTotal || initialCourts?.total_count || 0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Region + location options for dropdowns
  const [regions, setRegions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [locationIds, setLocationIds] = useState(() =>
    locationId ? [locationId] : []
  );

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
        const regionList = Array.isArray(data) ? data : (data.regions || []);
        setRegions(
          regionList
            .map((r) => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        const flat = regionList
          .flatMap((r) => (r.locations || []).map((loc) => ({
            id: loc.id,
            regionId: r.id,
            label: [loc.city, loc.state].filter(Boolean).join(', ') || loc.name,
          })))
          .sort((a, b) => a.label.localeCompare(b.label));
        setLocations(flat);
      })
      .catch(() => {});
  }, []);

  // Location options: filtered by region, user's location sorted first
  const locationOptions = useMemo(() => {
    const filtered = selectedRegionId
      ? locations.filter((loc) => loc.regionId === selectedRegionId)
      : locations;
    if (!userLocationId) return filtered;
    return [...filtered].sort((a, b) => {
      if (a.id === userLocationId) return -1;
      if (b.id === userLocationId) return 1;
      return 0;
    });
  }, [locations, selectedRegionId, userLocationId]);

  const fetchCourts = useCallback(async (pageNum = 1, resetList = true) => {
    setLoading(true);
    try {
      const filters = { page: pageNum, page_size: PAGE_SIZE };
      if (selectedRegionId) filters.region_id = selectedRegionId;
      if (locationIds.length > 0) filters.location_id = locationIds.join(',');
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
  }, [selectedRegionId, locationIds, search, surfaceType, isFree, minRating, userPos]);

  // Refetch when filters or user position change
  useEffect(() => {
    fetchCourts(1, true);
  }, [fetchCourts]);

  const handleLoadMore = () => fetchCourts(page + 1, false);
  const hasMore = courts.length < totalCount;

  const handleClearFilters = () => {
    setSearch('');
    setSelectedRegionId('');
    setLocationIds([]);
    setSurfaceType('');
    setIsFree(null);
    setMinRating(null);
  };

  const handleRegionChange = (regionId) => {
    setSelectedRegionId(regionId);
    // Clear location selections that don't belong to the new region
    if (regionId) {
      const regionLocIds = new Set(locations.filter((l) => l.regionId === regionId).map((l) => l.id));
      setLocationIds((prev) => prev.filter((id) => regionLocIds.has(id)));
    }
  };

  const handleToggleLocation = (id) => {
    setLocationIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const activeFilterCount = [
    search.trim(),
    selectedRegionId,
    locationIds.length > 0,
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
          {regions.length > 0 && (
            <div className="court-list__filter-group">
              <label className="court-list__filter-label">Region</label>
              <select
                value={selectedRegionId}
                onChange={(e) => handleRegionChange(e.target.value)}
                className="court-list__filter-select"
              >
                <option value="">All Regions</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}

          {locations.length > 0 && (
            <div className="court-list__filter-group">
              <label className="court-list__filter-label">Location</label>
              <SearchableMultiSelect
                options={locationOptions}
                selectedIds={locationIds}
                onToggle={handleToggleLocation}
                placeholder="Search locations..."
              />
            </div>
          )}

          <div className="court-list__filter-group">
            <label className="court-list__filter-label">Surface</label>
            <select
              value={surfaceType}
              onChange={(e) => setSurfaceType(e.target.value)}
              className="court-list__filter-select"
            >
              {SURFACE_FILTER_OPTIONS.map((opt) => (
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
