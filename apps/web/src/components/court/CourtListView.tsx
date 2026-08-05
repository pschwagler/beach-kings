'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { MapPin, SlidersHorizontal, Star, X } from 'lucide-react';
import { getPublicLocations } from '../../services/api';
import SearchableMultiSelect from '../ui/SearchableMultiSelect';
import CourtCard from './CourtCard';
import { SURFACE_OPTIONS } from '../../constants/court';
import type { Court } from '../../types';
import './CourtListView.css';

export interface CourtDiscoveryFilters {
  regionId: string;
  locationIds: string[];
  surfaceType: string;
  isFree: boolean | null;
  minRating: number | null;
}

interface Props {
  courts: Court[];
  totalCount: number;
  loading: boolean;
  error?: string | null;
  filters: CourtDiscoveryFilters;
  onFiltersChange: (filters: CourtDiscoveryFilters) => void;
  selectedCourtId?: Court['id'] | null;
  highlightedCourtId?: Court['id'] | null;
  onSelectCourt?: (court: Court) => void;
  onHighlightCourt?: (court: Court | null) => void;
  variant?: 'grid' | 'rail';
  userLocationId?: string;
}

const SURFACES = [{ value: '', label: 'All surfaces' }, ...SURFACE_OPTIONS];

export default function CourtListView({
  courts, totalCount, loading, error, filters, onFiltersChange, selectedCourtId,
  highlightedCourtId, onSelectCourt, onHighlightCourt, variant = 'grid', userLocationId,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const [regions, setRegions] = useState<Array<{ id: string; name: string }>>([]);
  const [locations, setLocations] = useState<Array<{ id: string; regionId: string; label: string }>>([]);

  useEffect(() => {
    getPublicLocations().then((data) => {
      const source = Array.isArray(data) ? data : (data.regions || []);
      setRegions(source.map((region: any) => ({ id: region.id, name: region.name })).sort((a: any, b: any) => a.name.localeCompare(b.name)));
      setLocations(source.flatMap((region: any) => (region.locations || []).map((location: any) => ({
        id: location.id, regionId: region.id,
        label: [location.city, location.state].filter(Boolean).join(', ') || location.name,
      }))).sort((a: any, b: any) => a.label.localeCompare(b.label)));
    }).catch(() => {});
  }, []);

  const locationOptions = useMemo(() => {
    const options = filters.regionId ? locations.filter((item) => item.regionId === filters.regionId) : locations;
    return [...options].sort((a, b) => a.id === userLocationId ? -1 : b.id === userLocationId ? 1 : a.label.localeCompare(b.label));
  }, [filters.regionId, locations, userLocationId]);
  const activeFilterCount = [filters.regionId, filters.locationIds.length, filters.surfaceType, filters.isFree !== null, filters.minRating].filter(Boolean).length;
  const update = (patch: Partial<CourtDiscoveryFilters>) => onFiltersChange({ ...filters, ...patch });
  const clear = () => onFiltersChange({ regionId: '', locationIds: [], surfaceType: '', isFree: null, minRating: null });

  return (
    <div className={`court-list court-list--${variant}`}>
      <div className="court-list__toolbar">
        <p className="court-list__count"><strong>{totalCount}</strong> court{totalCount === 1 ? '' : 's'} in this area</p>
        <button type="button" className={`court-list__filter-toggle${activeFilterCount ? ' court-list__filter-toggle--active' : ''}`} onClick={() => setShowFilters((value) => !value)} aria-expanded={showFilters}>
          <SlidersHorizontal size={16} /> Filters
          {activeFilterCount > 0 && <span className="court-list__filter-badge">{activeFilterCount}</span>}
        </button>
      </div>

      {showFilters && (
        <div className="court-list__filters">
          {regions.length > 0 && <label className="court-list__filter-group"><span>Region</span><select value={filters.regionId} onChange={(event) => {
            const regionId = event.target.value;
            const valid = new Set(locations.filter((item) => !regionId || item.regionId === regionId).map((item) => item.id));
            update({ regionId, locationIds: filters.locationIds.filter((id) => valid.has(id)) });
          }}><option value="">All regions</option>{regions.map((region) => <option key={region.id} value={region.id}>{region.name}</option>)}</select></label>}
          {locations.length > 0 && <div className="court-list__filter-group"><span>Location</span><SearchableMultiSelect options={locationOptions} selectedIds={filters.locationIds} onToggle={(id) => update({ locationIds: filters.locationIds.includes(id) ? filters.locationIds.filter((item) => item !== id) : [...filters.locationIds, id] })} placeholder="Search locations…" /></div>}
          <label className="court-list__filter-group"><span>Surface</span><select value={filters.surfaceType} onChange={(event) => update({ surfaceType: event.target.value })}>{SURFACES.map((surface) => <option key={surface.value} value={surface.value}>{surface.label}</option>)}</select></label>
          <label className="court-list__filter-group"><span>Cost</span><select value={filters.isFree === null ? '' : String(filters.isFree)} onChange={(event) => update({ isFree: event.target.value === '' ? null : event.target.value === 'true' })}><option value="">All</option><option value="true">Free</option><option value="false">Paid</option></select></label>
          <label className="court-list__filter-group"><span>Rating</span><select value={filters.minRating || ''} onChange={(event) => update({ minRating: event.target.value ? Number(event.target.value) : null })}><option value="">Any</option><option value="4">4+ stars</option><option value="3">3+ stars</option><option value="2">2+ stars</option></select></label>
          {activeFilterCount > 0 && <button type="button" className="court-list__clear-filters" onClick={clear}><X size={14} /> Clear all</button>}
        </div>
      )}

      {loading && <div className="court-list__status" role="status"><span className="court-list__loading-bar" /> Finding courts in this area…</div>}
      {error && !loading && <div className="court-list__status court-list__status--error" role="alert"><strong>Courts couldn’t load.</strong><span>{error}</span></div>}
      {!loading && !error && courts.length === 0 && <div className="court-list__empty"><MapPin size={28} /><h3>No courts in this area yet</h3><p>Move the map, broaden your filters, or search another place.</p></div>}

      {variant === 'grid' ? (
        <div className="court-list__grid">{courts.map((court) => <div id={`court-${court.id}`} key={court.id} className={selectedCourtId === court.id ? 'court-list__selected-card' : ''}><CourtCard court={court} /></div>)}</div>
      ) : (
        <div className="court-list__rail-results">{courts.map((court) => (
          <article
            key={court.id}
            className={`court-result${selectedCourtId === court.id ? ' court-result--selected' : ''}${highlightedCourtId === court.id ? ' court-result--highlighted' : ''}`}
            onMouseEnter={() => onHighlightCourt?.(court)} onMouseLeave={() => onHighlightCourt?.(null)}
            onFocus={() => onHighlightCourt?.(court)}
          >
            <button type="button" className="court-result__select" onClick={() => onSelectCourt?.(court)} aria-pressed={selectedCourtId === court.id}>
              <span><strong>{court.name}</strong><small>{court.address || [court.city, court.state].filter(Boolean).join(', ')}</small></span>
              <span className="court-result__rating">{(court.review_count || 0) > 0 ? <><Star size={13} fill="currentColor" /> {court.average_rating?.toFixed(1)}</> : 'New'}</span>
            </button>
            <Link href={`/courts/${court.slug}`} className="court-result__details">View court details</Link>
          </article>
        ))}</div>
      )}
    </div>
  );
}
