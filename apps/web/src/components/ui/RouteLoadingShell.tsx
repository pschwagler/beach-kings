'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../../contexts/AuthContext';
import { useAuthModal } from '../../contexts/AuthModalContext';
import { useApp } from '../../contexts/AppContext';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { createLeague } from '../../services/api';
import NavBar from '../layout/NavBar';
import PageSkeleton from './PageSkeleton';

/** Navbar-preserving fallback for route-level Suspense boundaries. */
export default function RouteLoadingShell() {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { userLeagues, refreshLeagues } = useApp();
  const { openModal } = useModal();

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // Navigation still clears the loading shell if logout is unavailable.
    } finally {
      router.push('/');
    }
  };

  const handleLeaguesMenuClick = (action: string, leagueId: number | null = null) => {
    if (action === 'find-leagues') {
      router.push('/find-leagues');
    } else if (action === 'view-league' && leagueId) {
      router.push(`/league/${leagueId}`);
    } else if (action === 'create-league') {
      openModal(MODAL_TYPES.CREATE_LEAGUE, {
        onSubmit: async (leagueData: Record<string, unknown>) => {
          const league = await createLeague(leagueData);
          await refreshLeagues();
          router.push(`/league/${league.id}?tab=details`);
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
        onSignOut={handleSignOut}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
        onLeaguesMenuClick={handleLeaguesMenuClick}
      />
      <PageSkeleton />
    </>
  );
}
