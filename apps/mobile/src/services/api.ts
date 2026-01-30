/**
 * API client initialization for mobile app
 * Uses expo-secure-store for secure token storage
 */

import { initApiClient, setStorageAdapter } from '@beach-kings/api-client';
import { mobileStorageAdapter } from '../adapters/storage';
import axios from 'axios';

// Set mobile storage adapter - this ensures all API clients use the same storage
setStorageAdapter(mobileStorageAdapter);

// Get API base URL from environment
// For iOS simulator: localhost should work
// For physical devices: use your computer's IP address instead of localhost
// Example: EXPO_PUBLIC_API_URL=http://192.168.1.XXX:8000
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Initialize API client - this creates a single instance with all methods
const apiMethods = initApiClient(API_BASE_URL, {
  onTokenRefresh: () => {},
  onAuthError: (error: any) => {
    console.error('Auth error:', error);
  },
});

// Create a custom axios instance that reads tokens from storage on each request
// This ensures it always has the latest token, even if setAuthTokens was called
// on a different instance (they all share the same storage)
const customAxios = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to read token from storage and add to headers
customAxios.interceptors.request.use(
  async (config) => {
    try {
      const tokens = await apiMethods.getStoredTokens();
      if (tokens.accessToken) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${tokens.accessToken}`;
      }
    } catch (error) {
      console.error('[API] Error reading tokens for request:', error);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Export API with methods from initApiClient and custom axios that reads from storage
export const api = {
  ...apiMethods,
  // Expose custom axios instance that reads tokens from storage on each request
  axios: customAxios,
} as typeof apiMethods & { 
  axios: typeof customAxios;
};

// Re-export all API methods for convenience
export * from '@beach-kings/api-client';

