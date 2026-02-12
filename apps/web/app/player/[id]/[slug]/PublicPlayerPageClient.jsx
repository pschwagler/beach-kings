'use client';

import { useAuth } from '../../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../../src/contexts/AuthModalContext';
import NavBar from '../../../../src/components/layout/NavBar';
import PublicPlayerPage from '../../../../src/components/player/PublicPlayerPage';

/**
 * Client wrapper for the player profile page.
 * Renders NavBar (required on all pages) + PublicPlayerPage.
 * Auth state determines whether to show login CTAs or not.
 */
export default function PublicPlayerPageClient({ player, canonicalSlug, currentSlug }) {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
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
