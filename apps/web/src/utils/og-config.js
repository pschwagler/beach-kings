/**
 * Shared configuration for dynamic OG image routes.
 * All three routes (league, player, location) use identical layout,
 * colors, font sizes, and logo treatment. Centralizing here avoids
 * ~20 duplicated magic numbers across the three files.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';

/** Image dimensions (Facebook/LinkedIn recommended). */
export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Logo file in /public. */
const LOGO_FILE = 'beach-league-gold-on-navy.png';

/** Layout & color tokens. */
export const OG_STYLES = {
  bgColor: '#0f172a',
  padding: '50px 80px',

  // Logo sizes (normal vs. fallback-only)
  logo: { width: 280, height: 77 },
  logoFallback: { width: 400, height: 110 },

  // Title line (league name, player name, city)
  title: {
    fontSize: 52,
    fontWeight: 700,
    color: '#ffffff',
    lineHeight: 1.2,
  },

  // Subtitle line (location text, "Beach Volleyball in" label)
  subtitle: {
    fontSize: 28,
    color: '#ffd78a',
  },

  // Badge pills (members, gender, level, stats)
  badge: {
    backgroundColor: '#2c7a8f',
    color: '#ffffff',
    padding: '8px 24px',
    borderRadius: '20px',
    fontSize: 22,
    fontWeight: 600,
  },

  badgeGap: '16px',
  sectionGap: '16px',
};

/** Cache-Control header value (matches 5min ISR revalidation). */
export const OG_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
};

/**
 * Reads the Beach League logo from /public and returns a base64 data URI.
 *
 * @returns {Promise<string>} data:image/png;base64,... string
 */
export async function loadLogoDataUri() {
  const buffer = await readFile(join(process.cwd(), 'public', LOGO_FILE));
  return `data:image/png;base64,${buffer.toString('base64')}`;
}

/**
 * Truncates a display name to prevent overflow in the OG image.
 *
 * @param {string} text - The text to truncate
 * @param {number} [maxLen=45] - Maximum length before truncation
 * @returns {string} Truncated text with "..." suffix if needed
 */
export function truncateForOg(text, maxLen = 45) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

/**
 * Returns a fallback ImageResponse element (logo-only on navy background).
 * Used when the entity is not found or the backend is unreachable.
 *
 * @param {string} logoSrc - base64 data URI for the logo
 * @returns {JSX.Element}
 */
export function FallbackImage({ logoSrc }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        backgroundColor: OG_STYLES.bgColor,
      }}
    >
      <img
        src={logoSrc}
        width={OG_STYLES.logoFallback.width}
        height={OG_STYLES.logoFallback.height}
      />
    </div>
  );
}

/**
 * Returns the outer wrapper style for all OG images.
 *
 * @returns {Object} CSS style object
 */
export function outerStyle() {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    height: '100%',
    backgroundColor: OG_STYLES.bgColor,
    padding: OG_STYLES.padding,
  };
}
