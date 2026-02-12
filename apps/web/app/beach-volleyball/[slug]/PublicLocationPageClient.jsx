'use client';

import { useAuth } from '../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import NavBar from '../../../src/components/layout/NavBar';
import PublicLocationPage from '../../../src/components/location/PublicLocationPage';

/**
 * Client wrapper for the location landing page.
 * Renders NavBar (required on all pages) + PublicLocationPage.
 * Auth state determines whether to show login CTAs.
 */
export default function PublicLocationPageClient({ location }) {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
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
