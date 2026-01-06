/**
 * API Client for Beach Kings
 * Platform-agnostic API client with storage adapter support
 */

export * from './client';
export * from './storage';
export * from './methods';
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
  };
}

/**
 * Default export - creates a web API client
 */
export default function createDefaultApiClient() {
  const baseURL = typeof window !== 'undefined' 
    ? (process.env.NEXT_PUBLIC_API_URL || '')
    : '';
  return createApiClient(baseURL, new WebStorageAdapter());
}





