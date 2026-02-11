import { fetchBackend } from '../../../src/utils/server-fetch';
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
      },
    };
  } catch {
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
  } catch {
    // Backend unreachable or 404 — client will handle gracefully
  }

  return <LeaguePageClient leagueId={leagueId} publicLeagueData={publicLeagueData} />;
}
