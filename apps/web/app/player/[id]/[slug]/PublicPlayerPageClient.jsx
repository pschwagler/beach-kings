'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../../../src/contexts/ModalContext';
import { getUserLeagues, createLeague } from '../../../../src/services/api';
import NavBar from '../../../../src/components/layout/NavBar';
import PublicPlayerPage from '../../../../src/components/player/PublicPlayerPage';

/**
 * Client wrapper for the player profile page.
 * Renders NavBar (required on all pages) + PublicPlayerPage.
 * Auth state determines whether to show login CTAs or not.
 */
export default function PublicPlayerPageClient({ player, canonicalSlug, currentSlug }) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const [userLeagues, setUserLeagues] = useState([]);

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
      <PublicPlayerPage
        player={player}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
}
