import { fetchBackend } from '../../../src/utils/server-fetch';
import JsonLd from '../../../src/components/seo/JsonLd';
import LeaguePageClient from './LeaguePageClient';

/**
 * Build a meta description from public league data.
 */
function buildDescription(league) {
  const parts = [];

  if (league.location) {
    parts.push(
      `Beach volleyball league in ${league.location.city}, ${league.location.state}`
    );
  } else {
    parts.push('Beach volleyball league');
  }

  if (league.member_count) {
    parts.push(`${league.member_count} members`);
  }

  if (league.gender) {
    parts.push(league.gender);
  }

  if (league.level) {
    parts.push(league.level);
  }

  return parts.join(' · ') + '.';
}

/**
 * Generate SEO metadata for league pages via the public API.
 * Falls back to generic metadata if the league is not found.
 */
export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    const league = await fetchBackend(`/api/public/leagues/${id}`);
    const description = buildDescription(league);

    return {
      title: league.name,
      description,
      openGraph: {
        title: `${league.name} | Beach League Volleyball`,
        description,
        type: 'website',
        images: [{ url: `/api/og/league/${id}`, width: 1200, height: 630 }],
      },
    };
  } catch (error) {
    console.error(`[generateMetadata] League ${id}:`, error.message);
    return {
      title: 'League Not Found',
      description:
        'This league could not be found on Beach League Volleyball.',
    };
  }
}

/**
 * League page — server component that delegates rendering to LeaguePageClient.
 * generateMetadata() provides SEO tags; the client component handles auth + UI.
 * Pre-fetches public league data to avoid a second request on the client.
 */
export default async function LeaguePage({ params }) {
  const { id } = await params;
  const leagueId = parseInt(id);

  let publicLeagueData = null;
  try {
    publicLeagueData = await fetchBackend(`/api/public/leagues/${id}`);
  } catch (error) {
    console.error(`[LeaguePage] Failed to fetch league ${id}:`, error.message);
  }

  const jsonLd = publicLeagueData ? {
    '@context': 'https://schema.org',
    '@type': 'SportsOrganization',
    name: publicLeagueData.name,
    sport: 'Beach Volleyball',
    ...(publicLeagueData.location && {
      location: {
        '@type': 'Place',
        name: `${publicLeagueData.location.city}, ${publicLeagueData.location.state}`,
      },
    }),
    numberOfMembers: publicLeagueData.member_count,
    parentOrganization: {
      '@type': 'Organization',
      name: 'Beach League Volleyball',
      url: 'https://beachleaguevb.com',
    },
  } : null;

  return (
    <>
      {jsonLd && <JsonLd data={jsonLd} />}
      <LeaguePageClient leagueId={leagueId} publicLeagueData={publicLeagueData} />
    </>
  );
}
