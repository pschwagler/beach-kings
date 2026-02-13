import { notFound } from 'next/navigation';
import { fetchBackend } from '../../../src/utils/server-fetch';
import JsonLd from '../../../src/components/seo/JsonLd';
import PublicLocationPageClient from './PublicLocationPageClient';

/**
 * Build SEO description from location data.
 */
function buildDescription(location) {
  const parts = [`Beach volleyball in ${location.city}, ${location.state}`];

  if (location.stats?.total_leagues) {
    parts.push(`${location.stats.total_leagues} league${location.stats.total_leagues !== 1 ? 's' : ''}`);
  }

  if (location.stats?.total_players) {
    parts.push(`${location.stats.total_players} player${location.stats.total_players !== 1 ? 's' : ''}`);
  }

  if (location.stats?.total_matches) {
    parts.push(`${location.stats.total_matches} matches played`);
  }

  return parts.join(' · ') + '.';
}

/**
 * Generate SEO metadata for location landing pages via the public API.
 * Falls back to generic metadata if the location is not found.
 */
export async function generateMetadata({ params }) {
  const { slug } = await params;

  try {
    const location = await fetchBackend(`/api/public/locations/${slug}`);
    const description = buildDescription(location);
    const title = `Beach Volleyball in ${location.city}, ${location.state}`;

    return {
      title,
      description,
      openGraph: {
        title: `${title} | Beach League Volleyball`,
        description,
        type: 'website',
      },
    };
  } catch {
    return {
      title: 'Location Not Found',
      description: 'This location could not be found on Beach League Volleyball.',
    };
  }
}

/**
 * Location landing page — server component with SSR metadata.
 * Fetches public location data and passes to client component.
 */
export default async function LocationPage({ params }) {
  const { slug } = await params;

  let location = null;
  try {
    location = await fetchBackend(`/api/public/locations/${slug}`);
  } catch {
    notFound();
  }

  if (!location) {
    notFound();
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: `Beach Volleyball in ${location.city}, ${location.state}`,
    address: {
      '@type': 'PostalAddress',
      addressLocality: location.city,
      addressRegion: location.state,
    },
    ...(location.latitude && location.longitude && {
      geo: {
        '@type': 'GeoCoordinates',
        latitude: location.latitude,
        longitude: location.longitude,
      },
    }),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PublicLocationPageClient location={location} />
    </>
  );
}
