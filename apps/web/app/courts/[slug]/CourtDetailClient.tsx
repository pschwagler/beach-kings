'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../../src/contexts/ModalContext';
import {
  createLeague,
  getNearbyCourts,
  getCourtCheckIns,
  checkInToCourt,
  checkOutOfCourt,
  addPlayerHomeCourt,
  removePlayerHomeCourt,
  getPlayerHomeCourts,
} from '../../../src/services/api';
import { useApp } from '../../../src/contexts/AppContext';
import NavBar from '../../../src/components/layout/NavBar';
import CourtDetailHeader from '../../../src/components/court/CourtDetailHeader';
import CourtAmenities from '../../../src/components/court/CourtAmenities';
import CourtPhotoGallery from '../../../src/components/court/CourtPhotoGallery';
import CourtReviewSection from '../../../src/components/court/CourtReviewSection';
import CourtLeaderboard from '../../../src/components/court/CourtLeaderboard';
import CourtLeaguesSection from '../../../src/components/court/CourtLeaguesSection';
import NearbyCourtsList from '../../../src/components/court/NearbyCourtsList';
import SuggestEditForm from '../../../src/components/court/SuggestEditForm';
import { ArrowLeft } from 'lucide-react';
import '../../../src/components/court/CourtDetail.css';

/**
 * Client wrapper for the court detail page.
 * Renders NavBar + full court profile with reviews, leaderboard, and photos.
 */
interface CourtDetailClientProps {
  court: any;
  slug: string;
}

export default function CourtDetailClient({ court, slug }: CourtDetailClientProps) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { userLeagues, refreshLeagues } = useApp();
  const [nearbyCourts, setNearbyCourts] = useState([]);
  const [showSuggestEdit, setShowSuggestEdit] = useState(false);

  // Check-in state
  const [checkInCount, setCheckInCount] = useState(0);
  const [isCheckedIn, setIsCheckedIn] = useState(false);
  const [checkInLoading, setCheckInLoading] = useState(false);

  // Home court state
  const [isHomeCourt, setIsHomeCourt] = useState(false);
  const [homeCourtLoading, setHomeCourtLoading] = useState(false);

  // Fetch nearby courts
  useEffect(() => {
    if (!court?.latitude || !court?.longitude) return;
    getNearbyCourts(court.latitude, court.longitude, 25, court.id)
      .then(setNearbyCourts)
      .catch(() => {});
  }, [court?.latitude, court?.longitude, court?.id]);

  // Fetch active check-ins
  const refreshCheckIns = useCallback(() => {
    if (!slug) return;
    getCourtCheckIns(slug)
      .then((data: { count: number; checked_in_players: { player_id: number }[] }) => {
        setCheckInCount(data.count);
        if (currentUserPlayer?.id) {
          setIsCheckedIn(data.checked_in_players.some((p) => p.player_id === currentUserPlayer.id));
        }
      })
      .catch(() => {});
  }, [slug, currentUserPlayer?.id]);

  useEffect(() => {
    refreshCheckIns();
  }, [refreshCheckIns]);

  // Fetch home court status
  useEffect(() => {
    if (!currentUserPlayer?.id || !court?.id) return;
    getPlayerHomeCourts(currentUserPlayer.id)
      .then((courts: { id: number }[]) => {
        setIsHomeCourt(courts.some((c: { id: number }) => c.id === court.id));
      })
      .catch(() => {});
  }, [currentUserPlayer?.id, court?.id]);

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
          await refreshLeagues();
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

  const handleCheckInToggle = async () => {
    if (!isAuthenticated) {
      openAuthModal('sign-in');
      return;
    }
    if (!court?.id) return;
    setCheckInLoading(true);
    try {
      if (isCheckedIn) {
        await checkOutOfCourt(court.id);
      } else {
        await checkInToCourt(court.id);
      }
      refreshCheckIns();
    } catch {
      // silently handle - check-in is best-effort
    } finally {
      setCheckInLoading(false);
    }
  };

  const handleHomeCourtToggle = async () => {
    if (!isAuthenticated) {
      openAuthModal('sign-in');
      return;
    }
    if (!currentUserPlayer?.id || !court?.id) return;
    setHomeCourtLoading(true);
    try {
      if (isHomeCourt) {
        await removePlayerHomeCourt(currentUserPlayer.id, court.id);
        setIsHomeCourt(false);
      } else {
        await addPlayerHomeCourt(currentUserPlayer.id, court.id);
        setIsHomeCourt(true);
      }
    } catch {
      // revert on error
      setIsHomeCourt((prev) => !prev);
    } finally {
      setHomeCourtLoading(false);
    }
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
          <Link href="/courts">Browse all courts</Link>
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
        <nav className="court-detail__breadcrumb">
          <Link href="/courts" className="court-detail__breadcrumb-link">Courts</Link>
          {court.location_name && court.location_slug && (
            <>
              <span className="court-detail__breadcrumb-sep">/</span>
              <a
                href={`/beach-volleyball/${court.location_slug}`}
                className="court-detail__breadcrumb-link"
              >
                {court.location_name}
              </a>
            </>
          )}
          <span className="court-detail__breadcrumb-sep">/</span>
          <span className="court-detail__breadcrumb-current">{court.name}</span>
        </nav>

        <CourtDetailHeader court={court} onSuggestEdit={handleSuggestEdit} />

        <div className="court-detail__action-row">
          <button
            className={`court-detail__action-btn ${isCheckedIn ? 'court-detail__action-btn--active' : 'court-detail__action-btn--primary'}`}
            onClick={handleCheckInToggle}
            disabled={checkInLoading}
          >
            {isCheckedIn ? 'Check Out' : 'Check In'}
          </button>
          <button
            className={`court-detail__action-btn ${isHomeCourt ? 'court-detail__action-btn--active' : 'court-detail__action-btn--outline'}`}
            onClick={handleHomeCourtToggle}
            disabled={homeCourtLoading}
          >
            {isHomeCourt ? 'In My Courts' : 'Add to My Courts'}
          </button>
        </div>

        {checkInCount > 0 && (
          <p className="court-detail__checkin-count">
            {checkInCount} {checkInCount === 1 ? 'person' : 'people'} here now
          </p>
        )}

        <CourtPhotoGallery photos={court.all_photos || []} slug={slug} />

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

        <CourtLeaguesSection slug={slug} />

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
