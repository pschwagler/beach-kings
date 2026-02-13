import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { BACKEND_URL } from '../../../../../src/utils/server-fetch';

/**
 * Dynamic OG image for player profile pages (1200x630).
 * Navy background with Beach League logo, player name, location, and stat badges.
 */
export async function GET(request, { params }) {
  const { id } = await params;

  // Read logo from public directory
  const logoBuffer = await readFile(
    join(process.cwd(), 'public', 'beach-league-gold-on-navy.png')
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  // Fetch player data from public API
  let player = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/public/players/${id}`);
    if (res.ok) {
      player = await res.json();
    }
  } catch (error) {
    console.error(`[OG player] Failed to fetch player ${id}:`, error.message);
  }

  // Fallback: logo-only image when player not found
  if (!player) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            backgroundColor: '#0f172a',
          }}
        >
          <img src={logoSrc} width={400} height={110} />
        </div>
      ),
      { width: 1200, height: 630 }
    );
  }

  // Truncate long names to prevent overflow
  const playerName =
    player.full_name.length > 40
      ? player.full_name.slice(0, 37) + '...'
      : player.full_name;

  const locationText = player.location
    ? `${player.location.city}, ${player.location.state}`
    : null;

  // Build stat badges from player data
  const stats = player.stats || {};
  const badges = [
    stats.current_rating && `${Math.round(stats.current_rating)} Rating`,
    stats.total_games && `${stats.total_games} Games`,
    stats.total_wins != null && stats.total_games
      ? `${stats.total_wins}W–${stats.total_games - stats.total_wins}L`
      : null,
    stats.win_rate != null && `${Math.round(stats.win_rate * 100)}% Win`,
  ].filter(Boolean);

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          height: '100%',
          backgroundColor: '#0f172a',
          padding: '50px 80px',
        }}
      >
        {/* Logo */}
        <img src={logoSrc} width={280} height={77} />

        {/* Player info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {playerName}
          </div>
          {locationText && (
            <div
              style={{
                fontSize: 28,
                color: '#ffd78a',
              }}
            >
              {locationText}
            </div>
          )}
        </div>

        {/* Stat badges */}
        <div
          style={{
            display: 'flex',
            gap: '16px',
          }}
        >
          {badges.map((badge) => (
            <div
              key={badge}
              style={{
                backgroundColor: '#2c7a8f',
                color: '#ffffff',
                padding: '8px 24px',
                borderRadius: '20px',
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {badge}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control':
          'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
