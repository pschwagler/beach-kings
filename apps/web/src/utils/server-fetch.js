/**
 * Server-side fetch utility for SSR data fetching.
 *
 * Uses BACKEND_INTERNAL_URL (container-to-container in Docker, localhost in dev)
 * with Next.js ISR revalidation (default 5 minutes).
 *
 * Only usable in server components, generateMetadata, sitemap.js, etc.
 */

const BACKEND_URL =
  process.env.BACKEND_INTERNAL_URL || 'http://localhost:8000';

const DEFAULT_REVALIDATE = 300; // 5 minutes

/**
 * Fetch JSON from the backend API (server-side only).
 * @param {string} path - API path, e.g. "/api/public/leagues"
 * @param {object} [options] - Override fetch options
 * @param {number} [options.revalidate] - ISR revalidation in seconds (default 300)
 * @param {object} [options.headers] - Additional headers
 * @returns {Promise<any>} Parsed JSON response
 * @throws {Error} On non-OK HTTP responses
 */
export async function fetchBackend(path, options = {}) {
  const { revalidate = DEFAULT_REVALIDATE, headers, ...rest } = options;

  const url = `${BACKEND_URL}${path}`;

  const res = await fetch(url, {
    next: { revalidate },
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    ...rest,
  });

  if (!res.ok) {
    throw new Error(`fetchBackend ${path}: ${res.status} ${res.statusText}`);
  }

  return res.json();
}
