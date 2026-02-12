'use client';

import { Suspense } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { useAuthModal } from '../../../src/contexts/AuthModalContext';
import { LeagueProvider } from '../../../src/contexts/LeagueContext';
import LeagueDashboard from '../../../src/components/league/LeagueDashboard';
import NavBar from '../../../src/components/layout/NavBar';
import PublicLeaguePage from './PublicLeaguePage';

/**
 * Client wrapper for the league page.
 * Authenticated users see the full LeagueDashboard.
 * Unauthenticated users see the PublicLeaguePage with Navbar and pre-fetched data.
 */
export default function LeaguePageClient({ leagueId, publicLeagueData }) {
  const { isAuthenticated } = useAuth();
  const { openAuthModal } = useAuthModal();

  if (isAuthenticated) {
    return (
      <LeagueProvider leagueId={leagueId}>
        <Suspense fallback={<div>Loading...</div>}>
          <LeagueDashboard leagueId={leagueId} />
        </Suspense>
      </LeagueProvider>
    );
  }

  return (
    <>
      <NavBar
        isLoggedIn={false}
        onSignIn={() => openAuthModal('sign-in')}
        onSignUp={() => openAuthModal('sign-up')}
      />
      <PublicLeaguePage league={publicLeagueData} leagueId={leagueId} />
    </>
  );
}
