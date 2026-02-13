import { ImageResponse } from 'next/og';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { BACKEND_URL } from '../../../../../src/utils/server-fetch';

/**
 * Dynamic OG image for location landing pages (1200x630).
 * Navy background with Beach League logo, city name, and stat badges.
 */
export async function GET(request, { params }) {
  const { slug } = await params;

  // Read logo from public directory
  const logoBuffer = await readFile(
    join(process.cwd(), 'public', 'beach-league-gold-on-navy.png')
  );
  const logoSrc = `data:image/png;base64,${logoBuffer.toString('base64')}`;

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

  const cityName = `${location.city}, ${location.state}`;
  const displayName =
    cityName.length > 40 ? cityName.slice(0, 37) + '...' : cityName;

  const stats = location.stats || {};
  const badges = [
    stats.total_leagues && `${stats.total_leagues} League${stats.total_leagues !== 1 ? 's' : ''}`,
    stats.total_players && `${stats.total_players} Player${stats.total_players !== 1 ? 's' : ''}`,
    stats.total_matches && `${stats.total_matches} Matches`,
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

        {/* Location info */}
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
              fontSize: 28,
              color: '#ffd78a',
              textAlign: 'center',
            }}
          >
            Beach Volleyball in
          </div>
          <div
            style={{
              fontSize: 52,
              fontWeight: 700,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.2,
            }}
          >
            {displayName}
          </div>
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
