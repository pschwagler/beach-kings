'use client';

import { Suspense } from 'react';
import FindPlayersPage from '../../src/components/player/FindPlayersPage';

export default function FindPlayersPageRoute() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FindPlayersPage />
    </Suspense>
  );
}
