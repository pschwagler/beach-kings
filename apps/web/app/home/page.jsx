'use client';

import { Suspense } from 'react';
import HomePage from '../../src/components/HomePage';

export default function HomePageRoute() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomePage />
    </Suspense>
  );
}

