import { ImageResponse } from 'next/og';
import { BACKEND_URL } from '../../../../../src/utils/server-fetch';
import {
  OG_WIDTH,
  OG_HEIGHT,
  OG_STYLES,
  OG_CACHE_HEADERS,
  loadLogoDataUri,
  truncateForOg,
  FallbackImage,
  outerStyle,
} from '../../../../../src/utils/og-config';

/**
 * Dynamic OG image for player profile pages (1200x630).
 * Navy background with Beach League logo, player name, location, and stat badges.
 */
export async function GET(request, { params }) {
  const { id } = await params;

  const logoSrc = await loadLogoDataUri();

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
      <FallbackImage logoSrc={logoSrc} />,
      { width: OG_WIDTH, height: OG_HEIGHT }
    );
  }

  const playerName = truncateForOg(player.full_name, 40);

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
      <div style={outerStyle()}>
        {/* Logo */}
        <img
          src={logoSrc}
          width={OG_STYLES.logo.width}
          height={OG_STYLES.logo.height}
        />

        {/* Player info */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: OG_STYLES.sectionGap,
          }}
        >
          <div
            style={{
              ...OG_STYLES.title,
              textAlign: 'center',
            }}
          >
            {playerName}
          </div>
          {locationText && (
            <div style={OG_STYLES.subtitle}>{locationText}</div>
          )}
        </div>

        {/* Stat badges */}
        <div style={{ display: 'flex', gap: OG_STYLES.badgeGap }}>
          {badges.map((badge) => (
            <div key={badge} style={OG_STYLES.badge}>
              {badge}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      headers: OG_CACHE_HEADERS,
    }
  );
}
