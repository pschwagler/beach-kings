/**
 * Next.js dynamic sitemap generation via App Router convention.
 *
 * Fetches public leagues, players, and locations from backend sitemap
 * endpoints and generates XML sitemap entries for all indexable pages.
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import { fetchBackend } from '../src/utils/server-fetch';
import { slugify } from '../src/utils/slugify';

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://beachleaguevb.com';

/** Static pages included in every sitemap build. */
const STATIC_PAGES = [
  { path: '/', changeFrequency: 'weekly', priority: 1.0 },
  { path: '/find-leagues', changeFrequency: 'daily', priority: 0.9 },
  { path: '/find-players', changeFrequency: 'daily', priority: 0.9 },
  { path: '/courts', changeFrequency: 'daily', priority: 0.9 },
  { path: '/beach-volleyball', changeFrequency: 'weekly', priority: 0.8 },
  { path: '/privacy-policy', changeFrequency: 'yearly', priority: 0.2 },
  { path: '/terms-of-service', changeFrequency: 'yearly', priority: 0.2 },
];

/**
 * Generate the full sitemap for the site.
 * @returns {Promise<import('next').MetadataRoute.Sitemap>}
 */
export default async function sitemap() {
  const [leagues, players, locations, courts] = await Promise.all([
    fetchBackend('/api/public/sitemap/leagues').catch((error: Error) => {
      console.error('[sitemap] Failed to fetch leagues:', error.message);
      return [] as unknown[];
    }),
    fetchBackend('/api/public/sitemap/players').catch((error: Error) => {
      console.error('[sitemap] Failed to fetch players:', error.message);
      return [] as unknown[];
    }),
    fetchBackend('/api/public/sitemap/locations').catch((error: Error) => {
      console.error('[sitemap] Failed to fetch locations:', error.message);
      return [] as unknown[];
    }),
    fetchBackend('/api/public/sitemap/courts').catch((error: Error) => {
      console.error('[sitemap] Failed to fetch courts:', error.message);
      return [] as unknown[];
    }),
  ]);

  const staticEntries = STATIC_PAGES.map(({ path, changeFrequency, priority }) => ({
    url: `${BASE_URL}${path}`,
    changeFrequency,
    priority,
  }));

  const leagueEntries = (leagues as Array<{ id: number; updated_at?: string }>).map((league) => ({
    url: `${BASE_URL}/league/${league.id}`,
    lastModified: league.updated_at || undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const playerEntries = (players as Array<{ id: number; full_name: string; updated_at?: string }>).map((player) => ({
    url: `${BASE_URL}/player/${player.id}/${slugify(player.full_name)}`,
    lastModified: player.updated_at || undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  const locationEntries = (locations as Array<{ slug: string; updated_at?: string }>).map((location) => ({
    url: `${BASE_URL}/beach-volleyball/${location.slug}`,
    lastModified: location.updated_at || undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }));

  const courtEntries = (courts as Array<{ slug: string; updated_at?: string }>).map((court) => ({
    url: `${BASE_URL}/courts/${court.slug}`,
    lastModified: court.updated_at || undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.7,
  }));

  return [...staticEntries, ...leagueEntries, ...playerEntries, ...locationEntries, ...courtEntries];
}
