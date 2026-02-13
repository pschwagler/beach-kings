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
 * Dynamic OG image for location landing pages (1200x630).
 * Navy background with Beach League logo, city name, and stat badges.
 */
export async function GET(request, { params }) {
  const { slug } = await params;

  const logoSrc = await loadLogoDataUri();

  // Fetch location data from public API
  let location = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/public/locations/${slug}`);
    if (res.ok) {
      location = await res.json();
    }
  } catch (error) {
    console.error(
      `[OG location] Failed to fetch location ${slug}:`,
      error.message
    );
  }

  // Fallback: logo-only image when location not found
  if (!location) {
    return new ImageResponse(
      <FallbackImage logoSrc={logoSrc} />,
      { width: OG_WIDTH, height: OG_HEIGHT }
    );
  }

  const cityName = `${location.city}, ${location.state}`;
  const displayName = truncateForOg(cityName, 40);

  const stats = location.stats || {};
  const badges = [
    stats.total_leagues &&
      `${stats.total_leagues} League${stats.total_leagues !== 1 ? 's' : ''}`,
    stats.total_players &&
      `${stats.total_players} Player${stats.total_players !== 1 ? 's' : ''}`,
    stats.total_matches && `${stats.total_matches} Matches`,
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

        {/* Location info */}
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
              ...OG_STYLES.subtitle,
              textAlign: 'center',
            }}
          >
            Beach Volleyball in
          </div>
          <div
            style={{
              ...OG_STYLES.title,
              textAlign: 'center',
            }}
          >
            {displayName}
          </div>
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
