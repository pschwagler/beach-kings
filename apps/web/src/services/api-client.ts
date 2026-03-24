/**
 * API client for Beach Volleyball ELO backend
 */

import axios, { type InternalAxiosRequestConfig } from 'axios';

type RetryableRequest = InternalAxiosRequestConfig & { _retry?: boolean };

// In development we use relative /api (empty base) so Next.js proxy decides the backend;
// no compile-time URL is inlined, avoiding .next cache poisoning between dev and E2E.
// In production we use NEXT_PUBLIC_API_URL.
export const API_BASE_URL = typeof window !== 'undefined'
  ? (process.env.NODE_ENV === 'development' ? '' : (process.env.NEXT_PUBLIC_API_URL || ''))
  : '';

const ACCESS_TOKEN_KEY = 'beach_access_token';
const REFRESH_TOKEN_KEY = 'beach_refresh_token';
const isBrowser = typeof window !== 'undefined';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const refreshClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

const authTokens = {
  accessToken: isBrowser ? window.localStorage.getItem(ACCESS_TOKEN_KEY) : null,
  refreshToken: isBrowser ? window.localStorage.getItem(REFRESH_TOKEN_KEY) : null,
};

export const setAuthTokens = (accessToken: string | null, refreshToken: string | null = authTokens.refreshToken) => {
  authTokens.accessToken = accessToken;
  if (isBrowser) {
    if (accessToken) {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }

  if (typeof refreshToken !== 'undefined') {
    authTokens.refreshToken = refreshToken;
    if (isBrowser) {
      if (refreshToken) {
        window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  }
};

export const clearAuthTokens = () => {
  authTokens.accessToken = null;
  authTokens.refreshToken = null;
  if (isBrowser) {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
};

export const getStoredTokens = () => {
  if (isBrowser) {
    authTokens.accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
    authTokens.refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  }
  return {
    accessToken: authTokens.accessToken,
    refreshToken: authTokens.refreshToken,
  };
};

// Cross-tab token sync: when another tab writes new tokens to localStorage,
// update our in-memory copy so requests use the fresh values.
if (isBrowser) {
  window.addEventListener('storage', (e) => {
    if (e.key === ACCESS_TOKEN_KEY) {
      authTokens.accessToken = e.newValue;
    } else if (e.key === REFRESH_TOKEN_KEY) {
      authTokens.refreshToken = e.newValue;
    }
  });
}

/**
 * Decode JWT expiration timestamp without verification (client-side only).
 * Returns epoch seconds or null if token is malformed.
 */
const getTokenExp = (token: string): number | null => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp || null;
  } catch {
    return null;
  }
};

/** Threshold in seconds — refresh proactively when token expires within this window. */
const PROACTIVE_REFRESH_THRESHOLD_SECS = 120;

// --- Token refresh shared state ---
// Both the proactive (request interceptor) and reactive (401 response interceptor)
// refresh paths use this single refreshAccessToken() function, ensuring mutual
// exclusion via the isRefreshing flag and failedQueue.
let isRefreshing = false;
let failedQueue: Array<{ resolve: (value: string | null) => void; reject: (reason?: unknown) => void }> = [];

const processQueue = (error: any, token: string | null = null): void => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

/**
 * Single entry point for token refresh — used by both the proactive (request
 * interceptor) and reactive (401 response interceptor) paths.
 *
 * Guarantees only one refresh request is in-flight at a time. Concurrent
 * callers are queued and resolved when the single refresh completes.
 */
const refreshAccessToken = () => {
  if (isRefreshing) {
    return new Promise((resolve, reject) => {
      failedQueue.push({ resolve, reject });
    });
  }

  isRefreshing = true;

  const latestRefreshToken = isBrowser
    ? window.localStorage.getItem(REFRESH_TOKEN_KEY)
    : authTokens.refreshToken;

  if (!latestRefreshToken) {
    isRefreshing = false;
    return Promise.reject(new Error('No refresh token available'));
  }

  return refreshClient
    .post('/api/auth/refresh', { refresh_token: latestRefreshToken })
    .then(({ data }) => {
      setAuthTokens(data.access_token, data.refresh_token || authTokens.refreshToken);
      const newToken = data.access_token;
      isRefreshing = false;
      processQueue(null, newToken);
      return newToken;
    })
    .catch((err) => {
      isRefreshing = false;

      // Check if another tab already refreshed successfully
      if (isBrowser) {
        const freshToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
        if (freshToken && freshToken !== authTokens.accessToken) {
          authTokens.accessToken = freshToken;
          authTokens.refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
          processQueue(null, freshToken);
          return freshToken;
        }
      }

      clearAuthTokens();
      processQueue(err, null);
      return Promise.reject(err);
    });
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
  '/api/auth/check-phone',
  '/api/auth/google'
];

const isPublicAuthEndpoint = (url: string | undefined): boolean => {
  if (!url) return false;
  return PUBLIC_AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
};

// Cache decoded exp per token to avoid re-parsing on every request
let cachedTokenExp: { token: string | null; exp: number | null } = { token: null, exp: null };

api.interceptors.request.use(
  async (config) => {
    let token = authTokens.accessToken;

    // Proactive refresh: if access token expires within the threshold, refresh
    // before the request goes out (avoids a 401 round-trip).
    if (token && !isPublicAuthEndpoint(config.url)) {
      // Use cached exp value when token hasn't changed
      let exp;
      if (cachedTokenExp.token === token) {
        exp = cachedTokenExp.exp;
      } else {
        exp = getTokenExp(token);
        cachedTokenExp = { token, exp };
      }
      if (exp && exp - Date.now() / 1000 < PROACTIVE_REFRESH_THRESHOLD_SECS) {
        try {
          token = await refreshAccessToken();
          cachedTokenExp = { token, exp: getTokenExp(token) };
        } catch {
          // If proactive refresh fails, send the request with the current token
          // and let the 401 response interceptor handle it.
        }
      }
    }

    if (token) {
      config.headers = config.headers ?? ({} as any);
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest: RetryableRequest = error.config || {};
    const isUnauthorized = error.response?.status === 401;
    const isForbidden = error.response?.status === 403;
    const url = originalRequest.url || '';

    // Handle 403 Forbidden - show login modal
    if (isForbidden && isBrowser) {
      window.dispatchEvent(new CustomEvent('show-login-modal', {
        detail: { reason: 'forbidden' }
      }));
    }

    // Skip refresh for public endpoints that don't require authentication
    if (isUnauthorized && isPublicAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    // Attempt to refresh token if unauthorized and we have a refresh token
    if (
      isUnauthorized &&
      (authTokens.refreshToken || (isBrowser && window.localStorage.getItem(REFRESH_TOKEN_KEY))) &&
      !originalRequest._retry
    ) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers = originalRequest.headers ?? ({} as any);
        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
