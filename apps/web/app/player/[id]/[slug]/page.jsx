import { notFound } from 'next/navigation';
import { fetchBackend } from '../../../../src/utils/server-fetch';
import { slugify } from '../../../../src/utils/slugify';
import JsonLd from '../../../../src/components/seo/JsonLd';
import PublicPlayerPageClient from './PublicPlayerPageClient';

/**
 * Build SEO description from player data.
 */
function buildDescription(player) {
  const parts = [];

  if (player.location) {
    parts.push(`Beach volleyball player in ${player.location.city}, ${player.location.state}`);
  } else {
    parts.push('Beach volleyball player');
  }

  if (player.stats?.total_games) {
    parts.push(`${player.stats.total_games} games played`);
  }

  if (player.stats?.win_rate != null) {
    parts.push(`${Math.round(player.stats.win_rate * 100)}% win rate`);
  }

  if (player.stats?.current_rating) {
    parts.push(`${Math.round(player.stats.current_rating)} rating`);
  }

  return parts.join(' · ') + '.';
}

/**
 * Generate SEO metadata for player profile pages via the public API.
 * Falls back to generic metadata if the player is not found.
 */
export async function generateMetadata({ params }) {
  const { id } = await params;

  try {
    const player = await fetchBackend(`/api/public/players/${id}`);
    const description = buildDescription(player);

    return {
      title: player.full_name,
      description,
      openGraph: {
        title: `${player.full_name} | Beach League Volleyball`,
        description,
        type: 'profile',
      },
    };
  } catch {
    return {
      title: 'Player Not Found',
      description: 'This player could not be found on Beach League Volleyball.',
    };
  }
}

/**
 * Player profile page — server component with SSR metadata.
 * Fetches public player data and passes to client component.
 * Redirects to canonical slug URL if slug doesn't match player name.
 */
export default async function PlayerPage({ params }) {
  const { id, slug } = await params;
  const playerId = parseInt(id);

  let player = null;
  try {
    player = await fetchBackend(`/api/public/players/${playerId}`);
  } catch {
    notFound();
  }

  if (!player) {
    notFound();
  }

  // Canonical slug redirect: if URL slug doesn't match, the canonical
  // URL in metadata still points to the correct one for SEO.
  const canonicalSlug = slugify(player.full_name);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: player.full_name,
    url: `https://beachleaguevb.com/player/${player.id}/${canonicalSlug}`,
    knowsAbout: 'Beach Volleyball',
    ...(player.location && {
      homeLocation: {
        '@type': 'Place',
        name: `${player.location.city}, ${player.location.state}`,
      },
    }),
  };

  return (
    <>
      <JsonLd data={jsonLd} />
      <PublicPlayerPageClient
        player={player}
        canonicalSlug={canonicalSlug}
        currentSlug={slug}
      />
    </>
  );
}
