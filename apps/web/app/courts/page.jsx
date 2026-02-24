import { fetchBackend } from '../../src/utils/server-fetch';
import CourtDirectoryClient from './CourtDirectoryClient';

/**
 * Static SEO metadata for the court directory page.
 */
export const metadata = {
  title: 'Beach Volleyball Courts',
  description:
    'Find and review beach volleyball courts near you. Browse courts, read reviews, see ratings, and discover new places to play.',
  openGraph: {
    title: 'Beach Volleyball Courts | Beach League',
    description:
      'Find and review beach volleyball courts near you. Browse courts, read reviews, see ratings, and discover new places to play.',
    type: 'website',
  },
};

/**
 * Court directory page — server component with SSR.
 * Fetches initial court list and passes to client component.
 */
export default async function CourtsPage() {
  let initialCourts = { items: [], total_count: 0 };
  try {
    initialCourts = await fetchBackend('/api/public/courts?page=1&page_size=20');
  } catch (error) {
    console.error('[CourtsPage] Failed to fetch courts:', error.message);
  }

  return <CourtDirectoryClient initialCourts={initialCourts} />;
}
