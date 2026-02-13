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
 * Dynamic OG image for league pages (1200x630).
 * Navy background with Beach League logo, league name, location, and badges.
 */
export async function GET(request, { params }) {
  const { id } = await params;

  const logoSrc = await loadLogoDataUri();

  // Fetch league data from public API
  let league = null;
  try {
    const res = await fetch(`${BACKEND_URL}/api/public/leagues/${id}`);
    if (res.ok) {
      league = await res.json();
    }
  } catch (error) {
    console.error(`[OG league] Failed to fetch league ${id}:`, error.message);
  }

  // Fallback: logo-only image when league not found
  if (!league) {
    return new ImageResponse(
      <FallbackImage logoSrc={logoSrc} />,
      { width: OG_WIDTH, height: OG_HEIGHT }
    );
  }

  const leagueName = truncateForOg(league.name);

  const locationText = league.location
    ? `${league.location.city}, ${league.location.state}`
    : null;

  const badges = [
    league.member_count && `${league.member_count} Members`,
    league.gender,
    league.level,
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

        {/* League info */}
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
            {leagueName}
          </div>
          {locationText && (
            <div style={OG_STYLES.subtitle}>{locationText}</div>
          )}
        </div>

        {/* Badges */}
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
