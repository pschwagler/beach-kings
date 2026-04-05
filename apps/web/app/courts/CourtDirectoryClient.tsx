'use client';

import { useState, useEffect, Suspense, lazy } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAuthModal } from '../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../src/contexts/ModalContext';
import { getUserLeagues, createLeague, getPublicCourts } from '../../src/services/api';
import NavBar from '../../src/components/layout/NavBar';
import CourtListView from '../../src/components/court/CourtListView';
import AddCourtForm from '../../src/components/court/AddCourtForm';

const CourtMap = lazy(() => import('../../src/components/court/CourtMap'));
import { Button } from '../../src/components/ui/UI';
import { Plus, Map, List } from 'lucide-react';
import '../../src/components/court/CourtDirectory.css';
import '../../src/components/court/CourtMap.css';

const VIEW_STORAGE_KEY = 'court_directory_view';

/**
 * Client wrapper for the court directory page.
 * Renders NavBar + map/list toggle + court list or map view + optional "Add Court" form.
 * Supports ?location=<id> query param to pre-filter courts by location hub.
 */
interface CourtDirectoryClientProps {
  initialCourts: any;
}

export default function CourtDirectoryClient({ initialCourts }: CourtDirectoryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewMode, setViewMode] = useState('list');
  const [mapCourts, setMapCourts] = useState(null);

  const locationParam = searchParams.get('location') || null;

  // Restore saved view preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading localStorage on mount to restore preference
      if (saved === 'map' || saved === 'list') setViewMode(saved);
    } catch {}
  }, []);

  // Reset map courts when location filter changes so they refetch
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived state when filter param changes
    setMapCourts(null);
  }, [locationParam]);

  // Fetch courts for map view (filtered by location when param is set)
  useEffect(() => {
    if (viewMode !== 'map' || mapCourts) return;
    const params: { page: number; page_size: number; location_id?: string } = { page: 1, page_size: 500 };
    if (locationParam) params.location_id = locationParam;
    getPublicCourts(params)
      .then((data) => setMapCourts(data.items || []))
      .catch((err) => console.error('Error loading map courts:', err));
  }, [viewMode, mapCourts, locationParam]);

  const handleViewChange = (mode: string) => {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_STORAGE_KEY, mode); } catch {}
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    getUserLeagues()
      .then(setUserLeagues)
      .catch((err) => console.error('Error loading user leagues:', err));
  }, [isAuthenticated]);

  const handleSignOut = async () => {
    try { await logout(); } catch (e) { console.error('Logout error:', e); }
    router.push('/');
  };

  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === 'create-league') {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: async (leagueData: Record<string, unknown>) => {
          const newLeague = await createLeague(leagueData);
          setUserLeagues(await getUserLeagues());
          router.push(`/league/${newLeague.id}?tab=details`);
        },
      });
    }
  };

  const handleAddCourt = () => {
    if (!isAuthenticated) {
      openAuthModal('sign-in');
      return;
    }
    setShowAddForm(true);
  };

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        user={user}
        currentUserPlayer={currentUserPlayer}
        userLeagues={userLeagues}
        onLeaguesMenuClick={handleLeaguesMenuClick}
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />

      <div className="court-directory">
        <div className="court-directory__header">
          <div>
            <h1 className="court-directory__title">Beach Volleyball Courts</h1>
            <p className="court-directory__subtitle">
              Find, review, and rate courts near you
            </p>
          </div>
          <div className="court-directory__actions">
            <div className="court-view-toggle">
              <button
                className={`court-view-toggle__btn${viewMode === 'list' ? ' court-view-toggle__btn--active' : ''}`}
                onClick={() => handleViewChange('list')}
                aria-label="List view"
              >
                <List size={16} /> List
              </button>
              <button
                className={`court-view-toggle__btn${viewMode === 'map' ? ' court-view-toggle__btn--active' : ''}`}
                onClick={() => handleViewChange('map')}
                aria-label="Map view"
              >
                <Map size={16} /> Map
              </button>
            </div>
            <Button onClick={handleAddCourt} variant="default">
              <Plus size={16} /> Add Court
            </Button>
          </div>
        </div>

        {showAddForm && (
          <AddCourtForm
            onClose={() => setShowAddForm(false)}
            onSuccess={() => {
              setShowAddForm(false);
            }}
          />
        )}

        {viewMode === 'map' ? (
          <Suspense fallback={null}>
            <CourtMap
              courts={mapCourts || initialCourts?.items || []}
              userLocation={
                currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
                  ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
                  : undefined
              }
              locationFilter={locationParam ?? undefined}
            />
          </Suspense>
        ) : (
          <CourtListView
            initialCourts={locationParam ? null : initialCourts}
            locationId={locationParam ?? undefined}
            userLocationId={currentUserPlayer?.location_id ?? undefined}
            userLocation={
              currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
                ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}
