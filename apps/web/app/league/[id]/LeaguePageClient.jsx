'use client';

import { Suspense } from 'react';
import { useAuth } from '../../../src/contexts/AuthContext';
import { LeagueProvider } from '../../../src/contexts/LeagueContext';
import LeagueDashboard from '../../../src/components/league/LeagueDashboard';
import PublicLeaguePage from './PublicLeaguePage';

/**
 * Client wrapper for the league page.
 * Authenticated users see the full LeagueDashboard.
 * Unauthenticated users see the PublicLeaguePage with pre-fetched data.
 */
export default function LeaguePageClient({ leagueId, publicLeagueData }) {
  const { isAuthenticated, isInitializing } = useAuth();

  if (isInitializing) {
    return (
      <div className="public-league-loading">
        <div className="public-league-loading__spinner" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <LeagueProvider leagueId={leagueId}>
        <Suspense fallback={<div>Loading...</div>}>
          <LeagueDashboard leagueId={leagueId} />
        </Suspense>
      </LeagueProvider>
    );
  }

  return <PublicLeaguePage league={publicLeagueData} leagueId={leagueId} />;
}
