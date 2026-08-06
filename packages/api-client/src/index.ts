/**
 * API Client for Beach League
 * Platform-agnostic API client with storage adapter support
 */

export * from './client';
export * from './storage';
export * from './methods';
export * from './socialMethods';
export * from './notificationMethods';
export * from './statsMethods';
export * from './adminMethods';
export * from './authMethods';
export * from './courtMethods';
export * from './leagueMethods';
export * from './leagueInviteMethods';
export * from './matchMethods';
export * from './messageMethods';
export * from './playerMethods';
export * from './rankingMethods';
export * from './sessionMethods';
export * from './signupMethods';
export * from './userMethods';
export * from './moderationMethods';
export { createApiMethods } from './methods';

import { ApiClient } from './client';
import { WebStorageAdapter } from './storage';
import { createApiMethods } from './methods';

/**
 * Create a new API client instance
 */
export function createApiClient(baseURL: string, storageAdapter?: any) {
  const client = new ApiClient(baseURL, storageAdapter);
  const methods = createApiMethods(client);
  
  return {
    client,
    ...methods,
    setAuthTokens: (accessToken: string | null, refreshToken?: string | null) => 
      client.setAuthTokens(accessToken, refreshToken),
    clearAuthTokens: () => client.clearAuthTokens(),
    getStoredTokens: () => client.getStoredTokens(),
    onAuthInvalidated: (listener: () => void) => client.onAuthInvalidated(listener),
  };
}

/**
 * Default export - creates a web API client
 * In development uses relative /api (empty base); in production uses NEXT_PUBLIC_API_URL.
 */
export default function createDefaultApiClient() {
  const baseURL = typeof window !== 'undefined'
    ? (process.env.NODE_ENV === 'development' ? '' : (process.env.NEXT_PUBLIC_API_URL || ''))
    : '';
  return createApiClient(baseURL, new WebStorageAdapter());
}
