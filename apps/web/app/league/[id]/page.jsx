'use client';

import { Suspense, use } from 'react';
import { LeagueProvider } from '../../../src/contexts/LeagueContext';
import LeagueDashboard from '../../../src/components/league/LeagueDashboard';

export default function LeaguePage({ params }) {
  const { id } = use(params);
  const leagueId = parseInt(id);

  return (
    <LeagueProvider leagueId={leagueId}>
      <Suspense fallback={<div>Loading...</div>}>
        <LeagueDashboard leagueId={leagueId} />
      </Suspense>
    </LeagueProvider>
  );
}
