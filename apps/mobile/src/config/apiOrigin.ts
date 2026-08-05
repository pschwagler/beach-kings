const DEVELOPMENT_API_ORIGIN = 'http://localhost:8000';

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '[::1]'
  );
}

/**
 * Resolve and validate the backend origin embedded in the mobile bundle.
 * Plain HTTP and loopback hosts are deliberately limited to development.
 */
export function resolveApiOrigin(
  configuredValue: string | undefined,
  isDevelopment: boolean,
): string {
  const value = configuredValue?.trim();
  if (!value) {
    if (isDevelopment) return DEVELOPMENT_API_ORIGIN;
    throw new Error('EXPO_PUBLIC_API_URL is required for production builds.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL must be a valid absolute URL.');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('EXPO_PUBLIC_API_URL must use HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'EXPO_PUBLIC_API_URL must be an origin without credentials, query, or fragment.',
    );
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('EXPO_PUBLIC_API_URL must not include a path.');
  }

  const isLoopback = isLoopbackHostname(url.hostname);
  if (isLoopback && !isDevelopment) {
    throw new Error('EXPO_PUBLIC_API_URL cannot use localhost in production.');
  }
  if (url.protocol !== 'https:' && !(isDevelopment && isLoopback)) {
    throw new Error('EXPO_PUBLIC_API_URL must use HTTPS.');
  }

  return url.origin;
}

// Expo replaces direct EXPO_PUBLIC_* property access at bundle time. Keeping
// this eager makes a production-like bundle fail during startup, before a
// request can accidentally target an implicit development service.
export const API_ORIGIN = resolveApiOrigin(
  process.env.EXPO_PUBLIC_API_URL,
  __DEV__,
);

export function apiWebSocketUrl(path: string): string {
  const url = new URL(path, `${API_ORIGIN}/`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

