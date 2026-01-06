'use client';

import { Suspense } from 'react';
import FindLeaguesPage from '../../src/components/league/FindLeaguesPage';

export default function FindLeaguesPageRoute() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FindLeaguesPage />
    </Suspense>
  );
}
