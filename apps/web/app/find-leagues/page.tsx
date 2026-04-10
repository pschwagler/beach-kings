'use client';

import { Suspense } from 'react';
import FindLeaguesPage from '../../src/components/league/FindLeaguesPage';
import PageSkeleton from '../../src/components/ui/PageSkeleton';

export default function FindLeaguesPageRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <FindLeaguesPage />
    </Suspense>
  );
}

