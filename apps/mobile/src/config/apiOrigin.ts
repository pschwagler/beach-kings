import { resolveConfiguredOrigin } from './origin';

const DEVELOPMENT_API_ORIGIN = 'http://localhost:8000';

/**
 * Resolve and validate the backend origin embedded in the mobile bundle.
 * Plain HTTP is limited to development loopback and RFC1918 IPv4 hosts.
 */
export function resolveApiOrigin(
  configuredValue: string | undefined,
  isDevelopment: boolean,
): string {
  return resolveConfiguredOrigin({
    configuredValue,
    developmentDefault: isDevelopment ? DEVELOPMENT_API_ORIGIN : undefined,
    environmentVariable: 'EXPO_PUBLIC_API_URL',
    isDevelopment,
  });
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
