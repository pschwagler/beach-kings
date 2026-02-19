'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../src/contexts/AuthContext';
import { useAuthModal } from '../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../src/contexts/ModalContext';
import { getUserLeagues, createLeague, getPublicCourts } from '../../src/services/api';
import NavBar from '../../src/components/layout/NavBar';
import CourtListView from '../../src/components/court/CourtListView';
import CourtMap from '../../src/components/court/CourtMap';
import AddCourtForm from '../../src/components/court/AddCourtForm';
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
export default function CourtDirectoryClient({ initialCourts }) {
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
      if (saved === 'map' || saved === 'list') setViewMode(saved);
    } catch {}
  }, []);

  // Fetch all courts when map view is activated
  useEffect(() => {
    if (viewMode !== 'map' || mapCourts) return;
    getPublicCourts({ page: 1, page_size: 500 })
      .then((data) => setMapCourts(data.items || []))
      .catch((err) => console.error('Error loading map courts:', err));
  }, [viewMode, mapCourts]);

  const handleViewChange = (mode) => {
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

  const handleLeaguesMenuClick = (action, leagueId = null) => {
    if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === 'create-league') {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: async (leagueData) => {
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
          <CourtMap
            courts={mapCourts || initialCourts?.items || []}
            userLocation={
              currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
                ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
                : null
            }
          />
        ) : (
          <CourtListView
            initialCourts={locationParam ? null : initialCourts}
            locationId={locationParam}
            userLocation={
              currentUserPlayer?.city_latitude && currentUserPlayer?.city_longitude
                ? { latitude: currentUserPlayer.city_latitude, longitude: currentUserPlayer.city_longitude }
                : null
            }
          />
        )}
      </div>
    </>
  );
}
