import { API_ORIGIN } from './apiOrigin';
import { resolveConfiguredOrigin } from './origin';

function developmentWebOrigin(apiOrigin: string): string {
  const url = new URL(apiOrigin);
  if (url.protocol === 'http:' && url.port === '8000') url.port = '3000';
  return url.origin;
}

export function resolvePublicWebOrigin(
  configuredValue: string | undefined,
  apiOrigin: string,
  isDevelopment: boolean,
): string {
  return resolveConfiguredOrigin({
    configuredValue,
    developmentDefault: isDevelopment
      ? developmentWebOrigin(apiOrigin)
      : undefined,
    environmentVariable: 'EXPO_PUBLIC_WEB_URL',
    isDevelopment,
  });
}

// Expo replaces direct EXPO_PUBLIC_* property access at bundle time. Release
// builds require an explicit web origin; local development retains a fallback.
export const PUBLIC_WEB_ORIGIN = resolvePublicWebOrigin(
  process.env.EXPO_PUBLIC_WEB_URL,
  API_ORIGIN,
  __DEV__,
);
