'use client';

import { useAuth } from '../../src/contexts/AuthContext';
import { useAuthModal } from '../../src/contexts/AuthModalContext';
import NavBar from '../../src/components/layout/NavBar';
import LocationDirectory from '../../src/components/location/LocationDirectory';

/**
 * Client wrapper for the location directory page.
 * Renders NavBar (required on all pages) + LocationDirectory.
 * Auth state determines whether to show login CTAs.
 */
export default function LocationDirectoryClient({ regions }) {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  return (
    <>
      <NavBar
        isLoggedIn={isAuthenticated}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />
      <LocationDirectory
        regions={regions}
        isAuthenticated={isAuthenticated}
      />
    </>
  );
}
