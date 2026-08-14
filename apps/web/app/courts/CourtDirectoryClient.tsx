'use client';

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { List, Map as MapIcon, Plus, Search } from 'lucide-react';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAuthModal } from '../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../src/contexts/ModalContext';
import { useApp } from '../../src/contexts/AppContext';
import { createLeague, getPublicCourts, type PlaceSuggestion } from '../../src/services/api';
import { useUserPosition } from '../../src/hooks/useUserPosition';
import type { Court } from '../../src/types';
import NavBar from '../../src/components/layout/NavBar';
import CourtListView, { type CourtDiscoveryFilters } from '../../src/components/court/CourtListView';
import CourtSearchCombobox from '../../src/components/court/CourtSearchCombobox';
import AddCourtForm from '../../src/components/court/AddCourtForm';
import SegmentedControl from '../../src/components/ui/SegmentedControl';
import { Button } from '../../src/components/ui/UI';
import type { MapBounds } from '../../src/components/court/CourtMap';
import { boundsAround, fitMapBounds } from '../../src/utils/mapBounds';
import '../../src/components/court/CourtDirectory.css';
import '../../src/components/court/CourtMap.css';

const CourtMap = lazy(() => import('../../src/components/court/CourtMap'));
const VIEW_STORAGE_KEY = 'court_directory_view';
const NYC = { latitude: 40.7128, longitude: -74.006 };

const EMPTY_FILTERS: CourtDiscoveryFilters = { regionId: '', locationIds: [], surfaceType: '', isFree: null, minRating: null };

interface Props { initialCourts: { items?: Court[]; total_count?: number } }

export default function CourtDirectoryClient({ initialCourts }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { userLeagues, refreshLeagues } = useApp();
  const profilePosition = currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
    ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
    : null;
  const { position: userPosition } = useUserPosition(profilePosition);
  const locationParam = searchParams.get('location') || '';

  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [showAddForm, setShowAddForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<CourtDiscoveryFilters>({ ...EMPTY_FILTERS, locationIds: locationParam ? [locationParam] : [] });
  const [courts, setCourts] = useState<Court[]>(initialCourts.items || []);
  const [totalCount, setTotalCount] = useState(initialCourts.total_count || 0);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [highlightedCourt, setHighlightedCourt] = useState<Court | null>(null);
  const [committedBounds, setCommittedBounds] = useState<MapBounds>(() => boundsAround(profilePosition?.latitude ?? NYC.latitude, profilePosition?.longitude ?? NYC.longitude));
  const [pendingBounds, setPendingBounds] = useState<MapBounds | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const interactedRef = useRef(false);
  const firstLocationFetch = useRef(Boolean(locationParam));

  useEffect(() => {
    try { const saved = localStorage.getItem(VIEW_STORAGE_KEY); if (saved === 'list' || saved === 'map') setViewMode(saved); } catch {}
  }, []);

  useEffect(() => {
    if (!userPosition || interactedRef.current || search) return;
    setCommittedBounds(boundsAround(userPosition.latitude, userPosition.longitude));
  }, [userPosition, search]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchCourts = async () => {
      setLoading(true); setError(null);
      const params: Record<string, string | number | boolean> = { page: 1, page_size: 100 };
      if (!firstLocationFetch.current) Object.assign(params, committedBounds);
      if (filters.regionId) params.region_id = filters.regionId;
      if (filters.locationIds.length) params.location_id = filters.locationIds.join(',');
      if (filters.surfaceType) params.surface_type = filters.surfaceType;
      if (filters.isFree !== null) params.is_free = filters.isFree;
      if (filters.minRating) params.min_rating = filters.minRating;
      if (userPosition) { params.user_lat = userPosition.latitude; params.user_lng = userPosition.longitude; }
      try {
        const data = await getPublicCourts(params, controller.signal);
        const items: Court[] = data.items || [];
        setCourts(items); setTotalCount(data.total_count || 0); setPendingBounds(null);
        if (firstLocationFetch.current) {
          firstLocationFetch.current = false;
          const located = items.filter((court) => court.latitude != null && court.longitude != null);
          const fittedBounds = fitMapBounds(located.map((court) => ({
            latitude: court.latitude!,
            longitude: court.longitude!,
          })));
          if (fittedBounds) setCommittedBounds(fittedBounds);
        }
      } catch (fetchError: any) {
        if (!controller.signal.aborted) setError(fetchError?.response?.status === 422 ? 'This map area is not valid. Try zooming in.' : 'Check your connection and try moving the map again.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void fetchCourts();
    return () => controller.abort();
  }, [committedBounds, filters, userPosition]);

  useEffect(() => {
    if (!sheetExpanded) return;
    const collapse = (event: KeyboardEvent) => { if (event.key === 'Escape') setSheetExpanded(false); };
    window.addEventListener('keydown', collapse);
    return () => window.removeEventListener('keydown', collapse);
  }, [sheetExpanded]);

  useEffect(() => {
    if (!selectedCourt) return;
    document.getElementById(`court-${selectedCourt.id}`)?.scrollIntoView({ block: 'center' });
  }, [selectedCourt, courts]);

  const changeView = (value: 'list' | 'map') => { setViewMode(value); try { localStorage.setItem(VIEW_STORAGE_KEY, value); } catch {} };
  const commitArea = (bounds: MapBounds) => { interactedRef.current = true; setCommittedBounds(bounds); setPendingBounds(null); };
  const selectCourt = useCallback((court: Court | null) => { setSelectedCourt(court); if (court?.latitude != null && court.longitude != null) { interactedRef.current = true; setCommittedBounds(boundsAround(court.latitude, court.longitude, 6)); } }, []);
  const selectPlace = (place: PlaceSuggestion) => { interactedRef.current = true; setSelectedCourt(null); setSearch(place.primary_text); setCommittedBounds(place.bounds || boundsAround(place.latitude, place.longitude)); };
  const clearSearch = () => { setSearch(''); setSelectedCourt(null); setCommittedBounds(boundsAround(userPosition?.latitude ?? NYC.latitude, userPosition?.longitude ?? NYC.longitude)); };

  const listProps = { courts, totalCount, loading, error, filters, onFiltersChange: (next: CourtDiscoveryFilters) => { interactedRef.current = true; setFilters(next); }, selectedCourtId: selectedCourt?.id, highlightedCourtId: highlightedCourt?.id, onSelectCourt: selectCourt, onHighlightCourt: setHighlightedCourt, userLocationId: currentUserPlayer?.location_id ?? undefined };

  const handleSignOut = async () => { try { await logout(); } catch {} router.push('/'); };
  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
    if (action === 'view-league' && leagueId) router.push(`/league/${leagueId}`);
    if (action === 'create-league') openModal(MODAL_TYPES.CREATE_LEAGUE, { onSubmit: async (data: Record<string, unknown>) => { const league = await createLeague(data); await refreshLeagues(); router.push(`/league/${league.id}?tab=details`); } });
  };
  const handleAddCourt = () => { if (!isAuthenticated) openAuthModal('sign-in'); else setShowAddForm(true); };

  return <>
    <NavBar isLoggedIn={isAuthenticated} user={user} currentUserPlayer={currentUserPlayer} userLeagues={userLeagues} onLeaguesMenuClick={handleLeaguesMenuClick} onSignOut={handleSignOut} onSignIn={() => openAuthModal('sign-in')} onSignUp={() => openAuthModal('sign-up')} />
    <main className={`court-directory court-directory--${viewMode}`}>
      <header className="court-directory__header">
        <div className="court-directory__heading"><p className="court-directory__eyebrow"><Search size={14} /> Court finder</p><h1>Find your next court</h1><p>Beach League courts and places, in one search.</p></div>
        <div className="court-directory__actions">
          <SegmentedControl value={viewMode} onChange={changeView} label="Court view" options={[{ value: 'list', label: 'List', icon: <List size={16} /> }, { value: 'map', label: 'Map', icon: <MapIcon size={16} /> }]} />
          <Button onClick={handleAddCourt} className="court-directory__add"><Plus size={16} /> Add Court</Button>
        </div>
      </header>
      <CourtSearchCombobox value={search} onChange={setSearch} onClear={clearSearch} proximity={userPosition || undefined} onCourtSelect={(court) => { setSearch(court.name); selectCourt(court); if (viewMode === 'list') document.getElementById(`court-${court.id}`)?.scrollIntoView({ block: 'center' }); }} onPlaceSelect={selectPlace} />
      {showAddForm && <AddCourtForm onClose={() => setShowAddForm(false)} onSuccess={() => setShowAddForm(false)} />}

      {viewMode === 'list' ? <CourtListView {...listProps} variant="grid" /> : (
        <section className="court-discovery-map">
          <aside className="court-discovery-map__rail" aria-label="Courts in this area"><CourtListView {...listProps} variant="rail" /></aside>
          <div className="court-discovery-map__canvas">
            <Suspense fallback={<div className="court-map court-map__skeleton" />}><CourtMap courts={courts} selectedCourt={selectedCourt} highlightedCourt={highlightedCourt} committedBounds={committedBounds} userLocation={userPosition || undefined} onSelectCourt={selectCourt} onHighlightCourt={setHighlightedCourt} onBoundsChange={(bounds) => { interactedRef.current = true; setPendingBounds(bounds); }} /></Suspense>
            {pendingBounds && <button type="button" className="court-discovery-map__search-area" onClick={() => commitArea(pendingBounds)}>Search this area</button>}
            <section className={`court-mobile-sheet${sheetExpanded ? ' court-mobile-sheet--expanded' : ''}`} aria-label="Court results">
              <button type="button" className="court-mobile-sheet__header" aria-expanded={sheetExpanded} onClick={() => setSheetExpanded((value) => !value)}><span className="court-mobile-sheet__handle" /><strong>{totalCount} court{totalCount === 1 ? '' : 's'} in this area</strong><small>{selectedCourt?.name || courts[0]?.name || 'Move the map to explore'}</small></button>
              <div className="court-mobile-sheet__results"><CourtListView {...listProps} variant="rail" /></div>
            </section>
          </div>
        </section>
      )}
    </main>
  </>;
}
