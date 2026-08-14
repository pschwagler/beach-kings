'use client';

import { Suspense } from 'react';
import FindLeaguesPage from '../../src/components/league/FindLeaguesPage';
import RouteLoadingShell from '../../src/components/ui/RouteLoadingShell';

export default function FindLeaguesPageRoute() {
  return (
    <Suspense fallback={<RouteLoadingShell />}>
      <FindLeaguesPage />
    </Suspense>
  );
}
