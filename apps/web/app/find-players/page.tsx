import { Suspense } from 'react';
import FindPlayersPage from '../../src/components/player/FindPlayersPage';

/**
 * SEO metadata for the Find Players page.
 */
export const metadata = {
  title: 'Find Players | Beach League',
  description:
    'Search and discover beach volleyball players. Filter by location, gender, and skill level to find players near you.',
  openGraph: {
    title: 'Find Players | Beach League',
    description:
      'Search and discover beach volleyball players. Filter by location, gender, and skill level to find players near you.',
  },
};

/**
 * Server-rendered page wrapper for FindPlayersPage.
 * Exports metadata for SEO, renders client component inside Suspense.
 */
export default function FindPlayersPageRoute() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FindPlayersPage />
    </Suspense>
  );
}
