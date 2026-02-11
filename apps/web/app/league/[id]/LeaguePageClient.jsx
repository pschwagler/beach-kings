'use client';

import { Suspense } from 'react';
import { LeagueProvider } from '../../../src/contexts/LeagueContext';
import LeagueDashboard from '../../../src/components/league/LeagueDashboard';

/**
 * Client wrapper for the league page.
 * Renders the authenticated LeagueProvider + LeagueDashboard experience.
 */
export default function LeaguePageClient({ leagueId }) {
  return (
    <LeagueProvider leagueId={leagueId}>
      <Suspense fallback={<div>Loading...</div>}>
        <LeagueDashboard leagueId={leagueId} />
      </Suspense>
    </LeagueProvider>
  );
}
