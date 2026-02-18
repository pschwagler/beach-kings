'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../../src/contexts/ModalContext';
import { getUserLeagues, createLeague, getNearbyCourts } from '../../../src/services/api';
import NavBar from '../../../src/components/layout/NavBar';
import CourtDetailHeader from '../../../src/components/court/CourtDetailHeader';
import CourtAmenities from '../../../src/components/court/CourtAmenities';
import CourtPhotoGallery from '../../../src/components/court/CourtPhotoGallery';
import CourtReviewSection from '../../../src/components/court/CourtReviewSection';
import CourtLeaderboard from '../../../src/components/court/CourtLeaderboard';
import NearbyCourtsList from '../../../src/components/court/NearbyCourtsList';
import SuggestEditForm from '../../../src/components/court/SuggestEditForm';
import { ArrowLeft } from 'lucide-react';
import '../../../src/components/court/CourtDetail.css';

/**
 * Client wrapper for the court detail page.
 * Renders NavBar + full court profile with reviews, leaderboard, and photos.
 */
export default function CourtDetailClient({ court, slug }) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);
  const [nearbyCourts, setNearbyCourts] = useState([]);
  const [showSuggestEdit, setShowSuggestEdit] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    getUserLeagues()
      .then(setUserLeagues)
      .catch((err) => console.error('Error loading user leagues:', err));
  }, [isAuthenticated]);

  // Fetch nearby courts
  useEffect(() => {
    if (!court?.latitude || !court?.longitude) return;
    getNearbyCourts(court.latitude, court.longitude, 25, court.id)
      .then(setNearbyCourts)
      .catch(() => {});
  }, [court?.latitude, court?.longitude, court?.id]);

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

  const handleSuggestEdit = () => {
    if (!isAuthenticated) {
      openAuthModal('sign-in');
      return;
    }
    setShowSuggestEdit(true);
  };

  if (!court) {
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
        <div className="court-detail court-detail--not-found">
          <h1>Court Not Found</h1>
          <p>The court you&apos;re looking for doesn&apos;t exist or has been removed.</p>
          <a href="/courts">Browse all courts</a>
        </div>
      </>
    );
  }

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

      <div className="court-detail">
        <a href="/courts" className="court-detail__back-link">
          <ArrowLeft size={18} /> Browse All Courts
        </a>

        <CourtDetailHeader court={court} onSuggestEdit={handleSuggestEdit} />

        {court.all_photos?.length > 0 && (
          <CourtPhotoGallery photos={court.all_photos} slug={slug} />
        )}

        <CourtAmenities court={court} />

        {(court.hours || court.phone || court.website) && (
          <div className="court-detail__info-section">
            <h2 className="court-detail__section-title">Hours & Contact</h2>
            {court.hours && <p className="court-detail__info-row"><strong>Hours:</strong> {court.hours}</p>}
            {court.phone && <p className="court-detail__info-row"><strong>Phone:</strong> {court.phone}</p>}
            {court.website && (
              <p className="court-detail__info-row">
                <strong>Website:</strong>{' '}
                <a href={court.website} target="_blank" rel="noopener noreferrer">{court.website}</a>
              </p>
            )}
            {court.cost_info && <p className="court-detail__info-row"><strong>Cost:</strong> {court.cost_info}</p>}
            {court.parking_info && <p className="court-detail__info-row"><strong>Parking:</strong> {court.parking_info}</p>}
          </div>
        )}

        {court.description && (
          <div className="court-detail__description">
            <h2 className="court-detail__section-title">About</h2>
            <p>{court.description}</p>
          </div>
        )}

        <CourtLeaderboard slug={slug} />

        <CourtReviewSection
          court={court}
          isAuthenticated={isAuthenticated}
          currentPlayerId={currentUserPlayer?.id}
          onAuthRequired={() => openAuthModal('sign-in')}
        />

        {showSuggestEdit && (
          <SuggestEditForm
            court={court}
            onClose={() => setShowSuggestEdit(false)}
            onSuccess={() => {
              setShowSuggestEdit(false);
              router.refresh();
            }}
          />
        )}

        {nearbyCourts.length > 0 && (
          <NearbyCourtsList courts={nearbyCourts} />
        )}
      </div>
    </>
  );
}
