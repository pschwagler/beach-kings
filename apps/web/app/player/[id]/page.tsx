import { notFound, redirect } from 'next/navigation';
import { fetchBackend } from '../../../src/utils/server-fetch';
import { slugify } from '../../../src/utils/slugify';

/**
 * Redirect /player/[id] to the canonical slug URL /player/[id]/[slug].
 * Fetches the player name from the public API to generate the slug.
 */
export default async function PlayerRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<never> {
  const { id } = await params;

  let player: { full_name: string } | null = null;
  try {
    player = await fetchBackend(`/api/public/players/${id}`);
  } catch (error) {
    console.error(`[PlayerRedirectPage] Failed to fetch player ${id}:`, (error as Error).message);
    notFound();
  }

  if (!player) {
    notFound();
  }

  const slug = slugify(player.full_name);
  redirect(`/player/${id}/${slug}`);
}
