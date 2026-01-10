/**
 * Create an API client instance with platform-specific storage
 */

import axios from 'axios';
import { getStorageAdapter } from './adapters/storage';

const ACCESS_TOKEN_KEY = 'beach_access_token';
const REFRESH_TOKEN_KEY = 'beach_refresh_token';

/**
 * Create API client instance
 * @param {string} baseURL - Base URL for API requests
 * @param {Object} options - Additional options
 * @param {Function} options.onTokenRefresh - Callback when token is refreshed
 * @param {Function} options.onAuthError - Callback when auth error occurs
 * @returns {Object} API client instance
 */
export function createApiClient(baseURL = '', options = {}) {
  const { onTokenRefresh, onAuthError } = options;
  
  const api = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const refreshClient = axios.create({
    baseURL,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // In-memory token cache
  const authTokens = {
    accessToken: null,
    refreshToken: null,
  };

  // Load tokens from storage on initialization
  const loadTokens = async () => {
    const storage = getStorageAdapter();
    authTokens.accessToken = await storage.getItem(ACCESS_TOKEN_KEY);
    authTokens.refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
  };

  // Initialize tokens
  loadTokens();

  const setAuthTokens = async (accessToken, refreshToken = authTokens.refreshToken) => {
    const storage = getStorageAdapter();
    authTokens.accessToken = accessToken;
    
    if (accessToken) {
      await storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      await storage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (typeof refreshToken !== 'undefined') {
      authTokens.refreshToken = refreshToken;
      if (refreshToken) {
        await storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        await storage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
    
    if (onTokenRefresh && accessToken) {
      onTokenRefresh(accessToken);
    }
  };

  const clearAuthTokens = async () => {
    const storage = getStorageAdapter();
    authTokens.accessToken = null;
    authTokens.refreshToken = null;
    await storage.removeItem(ACCESS_TOKEN_KEY);
    await storage.removeItem(REFRESH_TOKEN_KEY);
  };

  const getStoredTokens = async () => {
    const storage = getStorageAdapter();
    authTokens.accessToken = await storage.getItem(ACCESS_TOKEN_KEY);
    authTokens.refreshToken = await storage.getItem(REFRESH_TOKEN_KEY);
    return {
      accessToken: authTokens.accessToken,
      refreshToken: authTokens.refreshToken,
    };
  };

  // Request interceptor to add auth token
  api.interceptors.request.use(
    (config) => {
      const token = authTokens.accessToken;
      if (token) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    },
    (error) => Promise.reject(error)
  );

  // Queue to handle concurrent refresh attempts
  let isRefreshing = false;
  let failedQueue = [];

  const processQueue = (error, token = null) => {
    failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    failedQueue = [];
  };

  // Public endpoints that should never trigger token refresh
  const PUBLIC_AUTH_ENDPOINTS = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/refresh',
    '/api/auth/send-verification',
    '/api/auth/verify-phone',
    '/api/auth/reset-password',
    '/api/auth/reset-password-verify',
    '/api/auth/reset-password-confirm',
    '/api/auth/sms-login',
    '/api/auth/check-phone'
  ];

  const isPublicAuthEndpoint = (url) => {
    if (!url) return false;
    return PUBLIC_AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
  };

  // Response interceptor for token refresh
  api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config || {};
      const isUnauthorized = error.response?.status === 401;
      const isForbidden = error.response?.status === 403;
      const url = originalRequest.url || '';

      // Handle 403 Forbidden
      if (isForbidden && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('show-login-modal', { 
          detail: { reason: 'forbidden' } 
        }));
      }

      // Skip refresh for public endpoints
      if (isUnauthorized && isPublicAuthEndpoint(url)) {
        return Promise.reject(error);
      }

      // If already refreshing, queue this request
      if (isUnauthorized && isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return api(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      // Attempt to refresh token
      if (
        isUnauthorized &&
        authTokens.refreshToken &&
        !originalRequest._retry &&
        !isPublicAuthEndpoint(url)
      ) {
        originalRequest._retry = true;
        isRefreshing = true;

        try {
          const storage = getStorageAdapter();
          const latestRefreshToken = await storage.getItem(REFRESH_TOKEN_KEY) || authTokens.refreshToken;
          
          if (!latestRefreshToken) {
            await clearAuthTokens();
            isRefreshing = false;
            processQueue(error, null);
            if (onAuthError) onAuthError(error);
            return Promise.reject(error);
          }
          
          const { data } = await refreshClient.post('/api/auth/refresh', {
            refresh_token: latestRefreshToken,
          });
          
          const newAccessToken = data.access_token;
          await setAuthTokens(newAccessToken);
          
          isRefreshing = false;
          processQueue(null, newAccessToken);
          
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
          return api(originalRequest);
        } catch (refreshError) {
          await clearAuthTokens();
          isRefreshing = false;
          processQueue(refreshError, null);
          if (onAuthError) onAuthError(refreshError);
          return Promise.reject(error);
        }
      }

      return Promise.reject(error);
    }
  );

  return {
    api,
    setAuthTokens,
    clearAuthTokens,
    getStoredTokens,
  };
}

