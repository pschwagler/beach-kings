'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { X, Search, SlidersHorizontal, List, MapIcon } from 'lucide-react';
import { getPublicCourts, getPublicLocations } from '../../services/api';
import { useUserPosition } from '../../hooks/useUserPosition';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import CourtCard from './CourtCard';
import { Button } from '../ui/UI';
import { SURFACE_OPTIONS } from '../../constants/court';
import './CourtBrowserModal.css';

const SURFACE_FILTER_OPTIONS = [
  { value: '', label: 'All Surfaces' },
  ...SURFACE_OPTIONS,
];

const PAGE_SIZE = 20;

/**
 * Full-screen bottom-sheet modal for browsing and selecting courts.
 *
 * Reuses CourtCard (selectable variant), search, filters, and pagination
 * from the courts discovery page. Supports single-select and multi-select.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {() => void} props.onClose - Close handler
 * @param {(courts: Array<{id, name, address}>) => void} props.onConfirm - Called with selected courts
 * @param {'single'|'multi'} [props.mode='single'] - Selection mode
 * @param {number[]} [props.initialSelectedIds=[]] - Pre-selected court IDs (deprecated, prefer initialSelectedCourts)
 * @param {Array<{id, name, address}>} [props.initialSelectedCourts=[]] - Pre-selected courts with metadata
 * @param {string} [props.preFilterLocationId] - Pre-filter to a location
 * @param {string} [props.title] - Modal title override
 */
export default function CourtBrowserModal({
  isOpen,
  onClose,
  onConfirm,
  mode = 'single',
  initialSelectedIds = [],
  initialSelectedCourts = [],
  preFilterLocationId,
  title,
}) {
  const { position: userPos } = useUserPosition();

  const [courts, setCourts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedMap, setSelectedMap] = useState(() => new Map());

  // Filters
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [regions, setRegions] = useState([]);
  const [locations, setLocations] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState('');
  const [locationIds, setLocationIds] = useState(() =>
    preFilterLocationId ? [preFilterLocationId] : []
  );
  const [surfaceType, setSurfaceType] = useState('');
  const [isFree, setIsFree] = useState(null);
  const [minRating, setMinRating] = useState(null);

  // Initialize selected map from initialSelectedCourts (or fallback to IDs) on open
  useEffect(() => {
    if (isOpen) {
      const map = new Map();
      if (initialSelectedCourts.length > 0) {
        initialSelectedCourts.forEach((c) =>
          map.set(c.id, { id: c.id, name: c.name, address: c.address })
        );
      } else {
        initialSelectedIds.forEach((id) => map.set(id, { id }));
      }
      setSelectedMap(map);
      setSearch('');
      setShowFilters(false);
      setPage(1);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load location options
  useEffect(() => {
    if (!isOpen || regions.length > 0) return;
    getPublicLocations()
      .then((data) => {
        const regionList = Array.isArray(data) ? data : (data.regions || []);
        setRegions(
          regionList
            .map((r) => ({ id: r.id, name: r.name }))
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        const flat = regionList
          .flatMap((r) =>
            (r.locations || []).map((loc) => ({
              id: loc.id,
              regionId: r.id,
              label: [loc.city, loc.state].filter(Boolean).join(', ') || loc.name,
            }))
          )
          .sort((a, b) => a.label.localeCompare(b.label));
        setLocations(flat);
      })
      .catch(() => {});
  }, [isOpen, regions.length]);

  const locationOptions = useMemo(() => {
    return selectedRegionId
      ? locations.filter((loc) => loc.regionId === selectedRegionId)
      : locations;
  }, [locations, selectedRegionId]);

  const fetchCourts = useCallback(
    async (pageNum = 1, resetList = true) => {
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
        const items = data.items || [];
        if (resetList) {
          setCourts(items);
        } else {
          setCourts((prev) => [...prev, ...items]);
        }
        setTotalCount(data.total_count || 0);
        setPage(pageNum);

        // Enrich any selectedMap entries that are missing name/address
        setSelectedMap((prev) => {
          let changed = false;
          const next = new Map(prev);
          for (const court of items) {
            const entry = next.get(court.id);
            if (entry && !entry.name) {
              next.set(court.id, { id: court.id, name: court.name, address: court.address });
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      } catch (err) {
        console.error('Error fetching courts:', err);
      } finally {
        setLoading(false);
      }
    },
    [selectedRegionId, locationIds, search, surfaceType, isFree, minRating, userPos]
  );

  // Refetch when filters change
  useEffect(() => {
    if (!isOpen) return;
    fetchCourts(1, true);
  }, [fetchCourts, isOpen]);

  const handleSelect = useCallback(
    (court) => {
      if (mode === 'single') {
        // Single select: toggle or replace
        setSelectedMap((prev) => {
          const next = new Map();
          if (!prev.has(court.id)) {
            next.set(court.id, { id: court.id, name: court.name, address: court.address });
          }
          return next;
        });
      } else {
        // Multi select: toggle
        setSelectedMap((prev) => {
          const next = new Map(prev);
          if (next.has(court.id)) {
            next.delete(court.id);
          } else {
            next.set(court.id, { id: court.id, name: court.name, address: court.address });
          }
          return next;
        });
      }
    },
    [mode]
  );

  const handleConfirm = useCallback(() => {
    const selected = Array.from(selectedMap.values());
    onConfirm(selected);
    onClose();
  }, [selectedMap, onConfirm, onClose]);

  const handleRegionChange = (regionId) => {
    setSelectedRegionId(regionId);
    if (regionId) {
      const regionLocIds = new Set(
        locations.filter((l) => l.regionId === regionId).map((l) => l.id)
      );
      setLocationIds((prev) => prev.filter((id) => regionLocIds.has(id)));
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setSelectedRegionId('');
    setLocationIds([]);
    setSurfaceType('');
    setIsFree(null);
    setMinRating(null);
  };

  const activeFilterCount = [
    search.trim(),
    selectedRegionId,
    locationIds.length > 0,
    surfaceType,
    isFree !== null,
    minRating,
  ].filter(Boolean).length;

  const hasMore = courts.length < totalCount;
  const selectedCount = selectedMap.size;
  const defaultTitle = mode === 'single' ? 'Select Court' : 'Select Home Courts';

  if (!isOpen) return null;

  return (
    <div className="court-browser-overlay" onClick={onClose}>
      <div className="court-browser" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="court-browser__header">
          <h2 className="court-browser__title">{title || defaultTitle}</h2>
          <button
            className="court-browser__close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="court-browser__toolbar">
          <div className="court-browser__search">
            <Search size={16} className="court-browser__search-icon" />
            <input
              type="text"
              placeholder="Search courts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="court-browser__search-input"
            />
          </div>
          <button
            className={`court-browser__filter-toggle${activeFilterCount ? ' court-browser__filter-toggle--active' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
          >
            <SlidersHorizontal size={16} />
            Filters
            {activeFilterCount > 0 && (
              <span className="court-browser__filter-badge">{activeFilterCount}</span>
            )}
          </button>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="court-browser__filters">
            {regions.length > 0 && (
              <div className="court-browser__filter-group">
                <label className="court-browser__filter-label">Region</label>
                <select
                  value={selectedRegionId}
                  onChange={(e) => handleRegionChange(e.target.value)}
                  className="court-browser__filter-select"
                >
                  <option value="">All Regions</option>
                  {regions.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
            {locations.length > 0 && (
              <div className="court-browser__filter-group">
                <label className="court-browser__filter-label">Location</label>
                <SearchableMultiSelect
                  options={locationOptions}
                  selectedIds={locationIds}
                  onToggle={(id) =>
                    setLocationIds((prev) =>
                      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                    )
                  }
                  placeholder="Search locations..."
                />
              </div>
            )}
            <div className="court-browser__filter-group">
              <label className="court-browser__filter-label">Surface</label>
              <select
                value={surfaceType}
                onChange={(e) => setSurfaceType(e.target.value)}
                className="court-browser__filter-select"
              >
                {SURFACE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div className="court-browser__filter-group">
              <label className="court-browser__filter-label">Cost</label>
              <select
                value={isFree === null ? '' : isFree ? 'true' : 'false'}
                onChange={(e) =>
                  setIsFree(e.target.value === '' ? null : e.target.value === 'true')
                }
                className="court-browser__filter-select"
              >
                <option value="">All</option>
                <option value="true">Free</option>
                <option value="false">Paid</option>
              </select>
            </div>
            <div className="court-browser__filter-group">
              <label className="court-browser__filter-label">Min Rating</label>
              <select
                value={minRating || ''}
                onChange={(e) =>
                  setMinRating(e.target.value ? parseFloat(e.target.value) : null)
                }
                className="court-browser__filter-select"
              >
                <option value="">Any</option>
                <option value="4">4+ Stars</option>
                <option value="3">3+ Stars</option>
                <option value="2">2+ Stars</option>
              </select>
            </div>
            {activeFilterCount > 0 && (
              <button className="court-browser__clear-filters" onClick={handleClearFilters}>
                <X size={14} /> Clear All
              </button>
            )}
          </div>
        )}

        {/* Selected courts summary */}
        {mode === 'multi' && selectedCount > 0 && (
          <div className="court-browser__selected-summary">
            <div className="court-browser__selected-header">
              <span className="court-browser__selected-label">
                Selected ({selectedCount})
              </span>
              <button
                className="court-browser__clear-all"
                onClick={() => setSelectedMap(new Map())}
              >
                Clear All
              </button>
            </div>
            <div className="court-browser__selected-pills">
              {Array.from(selectedMap.values()).map((c) => (
                <span key={c.id} className="court-browser__selected-pill">
                  {c.name || `Court #${c.id}`}
                  <button
                    className="court-browser__selected-pill-remove"
                    onClick={() =>
                      setSelectedMap((prev) => {
                        const next = new Map(prev);
                        next.delete(c.id);
                        return next;
                      })
                    }
                    aria-label={`Remove ${c.name}`}
                  >
                    <X size={12} />
                  </button>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Results count */}
        <div className="court-browser__count">
          {totalCount} court{totalCount !== 1 ? 's' : ''} found
          {userPos && <span className="court-browser__count-hint"> · sorted by distance</span>}
        </div>

        {/* Grid */}
        <div className="court-browser__body">
          <div className="court-browser__grid">
            {courts.map((court) => (
              <CourtCard
                key={court.id}
                court={court}
                selectable
                selected={selectedMap.has(court.id)}
                onSelect={handleSelect}
              />
            ))}
          </div>

          {courts.length === 0 && !loading && (
            <div className="court-browser__empty">
              <h3>No courts found</h3>
              <p>Try adjusting your filters or search terms.</p>
            </div>
          )}

          {hasMore && (
            <div className="court-browser__load-more">
              <Button onClick={() => fetchCourts(page + 1, false)} disabled={loading} variant="outline">
                {loading ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="court-browser__footer">
          <button className="court-browser__cancel" onClick={onClose}>
            Cancel
          </button>
          <Button
            onClick={handleConfirm}
            disabled={selectedCount === 0}
          >
            {mode === 'single'
              ? 'Select'
              : `Done${selectedCount > 0 ? ` (${selectedCount})` : ''}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
