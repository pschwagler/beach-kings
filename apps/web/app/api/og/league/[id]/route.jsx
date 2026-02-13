import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Dynamic OG image for league pages (1200x630).
 * Navy background with Beach League logo, league name, location, and badges.
 */
export async function GET(request, { params }) {
  const { id } = await params;

  // Read logo from public directory
  const logoBuffer = await readFile(
    join(process.cwd(), 'public', 'beach-league-gold-on-navy.png')
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

  // Fetch league data from public API
  const backendUrl =
    process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';
  let league = null;
  try {
    const res = await fetch(`${backendUrl}/api/public/leagues/${id}`);
    if (res.ok) {
      league = await res.json();
    }
  } catch {
    // Backend unreachable — render fallback
  }

  // Fallback: logo-only image when league not found
  if (!league) {
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
  const leagueName =
    league.name.length > 45 ? league.name.slice(0, 42) + '...' : league.name;

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

        {/* League info */}
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
            {leagueName}
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

        {/* Badges */}
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
