'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useAuth } from '../../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../../src/contexts/AuthModalContext';
import { useModal, MODAL_TYPES } from '../../../../src/contexts/ModalContext';
import { createLeague, getPublicPlayer } from '../../../../src/services/api';
import { useApp } from '../../../../src/contexts/AppContext';
import NavBar from '../../../../src/components/layout/NavBar';
import HomeMenuBar from '../../../../src/components/home/HomeMenuBar';
import PublicPlayerPage from '../../../../src/components/player/PublicPlayerPage';

/**
 * Client wrapper for the player profile page.
 * Renders NavBar (required on all pages) + PublicPlayerPage.
 * Auth state determines whether to show login CTAs or not.
 */
interface PublicPlayerPageClientProps {
  player: any;
  canonicalSlug: string;
  currentSlug: string;
}

export default function PublicPlayerPageClient({ player, canonicalSlug, currentSlug }: PublicPlayerPageClientProps) {
  const router = useRouter();
  const { user, currentUserPlayer, isAuthenticated, logout } = useAuth();
  const { openAuthModal } = useAuthModal();
  const { openModal } = useModal();
  const { userLeagues, refreshLeagues } = useApp();
  const viewerId = isAuthenticated ? user?.id : undefined;
  const [viewerProfile, setViewerProfile] = useState<{
    viewerId: number;
    playerId: number;
    player: typeof player;
    signal: AbortSignal;
  } | null>(null);

  // The server-rendered profile is anonymous and safe to cache for SEO.
  // Fetch friend/owner visibility through the browser's authenticated API client.
  useEffect(() => {
    if (viewerId == null) return;
    const controller = new AbortController();
    getPublicPlayer(player.id, { signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) {
          setViewerProfile({ viewerId, playerId: player.id, player: result, signal: controller.signal });
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error('Error loading player profile:', error);
      });
    return () => controller.abort();
  }, [player.id, viewerId]);

  // Never retain another viewer's private data after logout, account changes,
  // or navigation to a different player, even before effect cleanup runs.
  const displayPlayer = viewerId != null
    && viewerProfile?.viewerId === viewerId
    && viewerProfile.playerId === player.id
    && !viewerProfile.signal.aborted
    ? viewerProfile.player
    : player;

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
      <div className="league-dashboard-container">
        <div className="league-dashboard">
          <HomeMenuBar activeTab="" />
          <main className="home-content">
            <PublicPlayerPage
              player={displayPlayer}
              isAuthenticated={isAuthenticated}
            />
          </main>
        </div>
      </div>
    </>
  );
}
