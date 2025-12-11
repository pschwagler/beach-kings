/**
 * API client initialization for mobile app
 * Uses expo-secure-store for secure token storage
 */

import { initApiClient, setStorageAdapter, createApiClient } from '@beach-kings/api-client';
import { mobileStorageAdapter } from '../adapters/storage';

// Set mobile storage adapter
setStorageAdapter(mobileStorageAdapter);

// Get API base URL from environment
// For iOS simulator: localhost should work
// For physical devices: use your computer's IP address instead of localhost
// Example: EXPO_PUBLIC_API_URL=http://192.168.1.XXX:8000
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Log the API URL being used (helpful for debugging)
console.log(`[API] Using base URL: ${API_BASE_URL}`);
console.log(`[API] To change this, set EXPO_PUBLIC_API_URL environment variable`);
console.log(`[API] Make sure backend is running: make dev-backend`);

// Initialize API client with mobile-specific options
// We use createApiClient directly to get access to the axios instance
const { api: axiosInstance, setAuthTokens, clearAuthTokens, getStoredTokens } = createApiClient(API_BASE_URL, {
  onTokenRefresh: (token: string) => {
    // Optional: Handle token refresh events
    console.log('Token refreshed');
  },
  onAuthError: (error: any) => {
    // Optional: Handle auth errors (e.g., navigate to login)
    console.error('Auth error:', error);
  },
});

// Initialize the API methods using initApiClient
const apiMethods = initApiClient(API_BASE_URL, {
  onTokenRefresh: (token: string) => {
    console.log('Token refreshed');
  },
  onAuthError: (error: any) => {
    console.error('Auth error:', error);
  },
});

// Export API with both methods and axios instance
export const api = {
  ...apiMethods,
  // Expose axios instance for custom calls
  axios: axiosInstance,
  // Also expose token management methods
  setAuthTokens,
  clearAuthTokens,
  getStoredTokens,
} as typeof apiMethods & { 
  axios: any;
  setAuthTokens: typeof setAuthTokens;
  clearAuthTokens: typeof clearAuthTokens;
  getStoredTokens: typeof getStoredTokens;
};

// Re-export all API methods for convenience
export * from '@beach-kings/api-client';



