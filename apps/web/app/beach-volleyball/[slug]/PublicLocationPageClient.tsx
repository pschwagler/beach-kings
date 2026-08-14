'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../../src/contexts/ModalContext';
import { createLeague } from '../../../src/services/api';
import { useApp } from '../../../src/contexts/AppContext';
import NavBar from '../../../src/components/layout/NavBar';
import PublicLocationPage from '../../../src/components/location/PublicLocationPage';

/**
 * Client wrapper for the location landing page.
 * Renders NavBar (required on all pages) + PublicLocationPage.
 * Auth state determines whether to show login CTAs.
 */
interface PublicLocationPageClientProps {
  location: any;
}

export default function PublicLocationPageClient({ location }: PublicLocationPageClientProps) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { userLeagues, refreshLeagues } = useApp();

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
      <PublicLocationPage
        location={location}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
}
