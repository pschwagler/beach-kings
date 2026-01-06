/**
 * API client for Beach Volleyball ELO backend
 * Platform-agnostic with storage adapter support
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StorageAdapter } from './storage';
import { WebStorageAdapter } from './storage';

const ACCESS_TOKEN_KEY = 'beach_access_token';
const REFRESH_TOKEN_KEY = 'beach_refresh_token';

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

function isPublicAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return PUBLIC_AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

interface QueuedRequest {
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
}

export class ApiClient {
  private api: AxiosInstance;
  private refreshClient: AxiosInstance;
  private storage: StorageAdapter;
  private authTokens: {
    accessToken: string | null;
    refreshToken: string | null;
  };
  private isRefreshing = false;
  private failedQueue: QueuedRequest[] = [];

  constructor(baseURL: string, storage?: StorageAdapter) {
    this.storage = storage || new WebStorageAdapter();
    this.authTokens = {
      accessToken: null,
      refreshToken: null,
    };

    this.api = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.refreshClient = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
    this.loadStoredTokens();
  }

  private async loadStoredTokens(): Promise<void> {
    try {
      this.authTokens.accessToken = await this.storage.getItem(ACCESS_TOKEN_KEY);
      this.authTokens.refreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY);
    } catch (error) {
      console.error('Error loading stored tokens:', error);
    }
  }

  private setupInterceptors(): void {
    // Request interceptor - add auth token
    this.api.interceptors.request.use(
      async (config) => {
        const token = this.authTokens.accessToken;
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - handle token refresh
    this.api.interceptors.response.use(
      (response) => response,
      async (error) => {
        const originalRequest = error.config || {};
        const isUnauthorized = error.response?.status === 401;
        const isForbidden = error.response?.status === 403;
        const url = originalRequest.url || '';

        // Handle 403 Forbidden - dispatch event for web
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
        if (isUnauthorized && this.isRefreshing) {
          return new Promise((resolve, reject) => {
            this.failedQueue.push({ resolve, reject });
          })
            .then(token => {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.api(originalRequest);
            })
            .catch(err => Promise.reject(err));
        }

        // Attempt to refresh token
        if (
          isUnauthorized &&
          this.authTokens.refreshToken &&
          !originalRequest._retry &&
          !isPublicAuthEndpoint(url)
        ) {
          originalRequest._retry = true;
          this.isRefreshing = true;

          try {
            const latestRefreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY) || this.authTokens.refreshToken;
            
            if (!latestRefreshToken) {
              await this.clearAuthTokens();
              this.isRefreshing = false;
              this.processQueue(error, null);
              return Promise.reject(error);
            }
            
            const { data } = await this.refreshClient.post('/api/auth/refresh', {
              refresh_token: latestRefreshToken,
            });
            
            const newAccessToken = data.access_token;
            await this.setAuthTokens(newAccessToken);
            
            this.isRefreshing = false;
            this.processQueue(null, newAccessToken);
            
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return this.api(originalRequest);
          } catch (refreshError) {
            await this.clearAuthTokens();
            this.isRefreshing = false;
            this.processQueue(refreshError, null);
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private processQueue(error: any, token: string | null): void {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  async setAuthTokens(accessToken: string | null, refreshToken?: string | null): Promise<void> {
    this.authTokens.accessToken = accessToken;
    if (accessToken) {
      await this.storage.setItem(ACCESS_TOKEN_KEY, accessToken);
    } else {
      await this.storage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (typeof refreshToken !== 'undefined') {
      this.authTokens.refreshToken = refreshToken;
      if (refreshToken) {
        await this.storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
      } else {
        await this.storage.removeItem(REFRESH_TOKEN_KEY);
      }
    }
  }

  async clearAuthTokens(): Promise<void> {
    this.authTokens.accessToken = null;
    this.authTokens.refreshToken = null;
    await this.storage.removeItem(ACCESS_TOKEN_KEY);
    await this.storage.removeItem(REFRESH_TOKEN_KEY);
  }

  async getStoredTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    this.authTokens.accessToken = await this.storage.getItem(ACCESS_TOKEN_KEY);
    this.authTokens.refreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY);
    return {
      accessToken: this.authTokens.accessToken,
      refreshToken: this.authTokens.refreshToken,
    };
  }

  // Expose axios instance for direct use
  get axiosInstance(): AxiosInstance {
    return this.api;
  }
}
