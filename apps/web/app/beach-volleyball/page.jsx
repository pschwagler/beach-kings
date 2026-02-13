import { fetchBackend } from '../../src/utils/server-fetch';
import LocationDirectoryClient from './LocationDirectoryClient';

/**
 * Static SEO metadata for the location directory page.
 */
export const metadata = {
  title: 'Beach Volleyball Locations',
  description:
    'Find beach volleyball leagues, players, and courts near you. Browse locations across the US.',
  openGraph: {
    title: 'Beach Volleyball Locations | Beach League Volleyball',
    description:
      'Find beach volleyball leagues, players, and courts near you. Browse locations across the US.',
    type: 'website',
  },
};

/**
 * Location directory page — server component with SSR.
 * Fetches all locations grouped by region and passes to client component.
 */
export default async function BeachVolleyballPage() {
  let regions = [];
  try {
    regions = await fetchBackend('/api/public/locations');
  } catch (error) {
    console.error('[BeachVolleyballPage] Failed to fetch locations:', error.message);
  }

  return <LocationDirectoryClient regions={regions} />;
}
