/**
 * API client for Beach Volleyball ELO backend
 * Platform-agnostic with storage adapter support
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StorageAdapter } from './storage';
import { WebStorageAdapter } from './storage';
import { readAbortError, withRequestDeadline } from './readRequest';

const ACCESS_TOKEN_KEY = 'beach_access_token';
const REFRESH_TOKEN_KEY = 'beach_refresh_token';

// Public endpoints that should never trigger token refresh
const PUBLIC_AUTH_ENDPOINTS = [
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/refresh',
  '/api/auth/send-verification',
  '/api/auth/send-email-verification',
  '/api/auth/verify-phone',
  '/api/auth/verify-email',
  '/api/auth/reset-password',
  '/api/auth/reset-password-verify',
  '/api/auth/reset-password-email',
  '/api/auth/reset-password-email-verify',
  '/api/auth/reset-password-confirm',
  '/api/auth/sms-login',
  '/api/auth/youth-eligibility',
  '/api/auth/google',
  '/api/auth/apple',
];

function isPublicAuthEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  return PUBLIC_AUTH_ENDPOINTS.some(endpoint => url.includes(endpoint));
}

interface QueuedRequest {
  resolve: (token: string | null) => void;
  reject: (error: any) => void;
  cleanup: () => void;
}

export type AuthInvalidationListener = () => void;

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
  private authInvalidationListeners = new Set<AuthInvalidationListener>();
  private authInvalidationEmitted = false;
  private authGeneration = 0;
  private refreshController: AbortController | null = null;
  private storageMutation: Promise<void> = Promise.resolve();

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
    const generation = this.authGeneration;
    try {
      const accessToken = await this.storage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY);
      if (generation === this.authGeneration) this.authTokens = { accessToken, refreshToken };
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

        // Cancelling a screen read must not initiate a refresh or invalidate auth.
        if (originalRequest.signal?.aborted) return Promise.reject(readAbortError());

        // React Native exposes a `window`-like global but does not provide the
        // browser CustomEvent constructor. Keep this legacy web notification
        // behind capability checks so native callers receive the original 403.
        if (
          isForbidden
          && typeof window !== 'undefined'
          && typeof window.dispatchEvent === 'function'
          && typeof CustomEvent !== 'undefined'
        ) {
          window.dispatchEvent(new CustomEvent('show-login-modal', { 
            detail: { reason: 'forbidden' } 
          }));
        }

        // Skip refresh for public endpoints
        if (isUnauthorized && isPublicAuthEndpoint(url)) {
          return Promise.reject(error);
        }

        // If already refreshing, queue this request
        if (isUnauthorized && !originalRequest._retry && this.isRefreshing) {
          originalRequest._retry = true;
          return new Promise((resolve, reject) => {
            const signal = originalRequest.signal;
            const cancel = () => {
              this.failedQueue = this.failedQueue.filter(item => item !== queued);
              queued.cleanup();
              reject(readAbortError());
            };
            const queued: QueuedRequest = {
              resolve, reject,
              cleanup: () => signal?.removeEventListener('abort', cancel),
            };
            this.failedQueue.push(queued);
            signal?.addEventListener('abort', cancel, { once: true });
            if (signal?.aborted) cancel();
          })
            .then(token => {
              if (originalRequest.signal?.aborted) throw readAbortError();
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              return this.api(originalRequest);
            })
            .catch(err => Promise.reject(err));
        }

        // Attempt to refresh token. Mark refreshing before consulting storage
        // so concurrent 401s join the queue instead of starting another
        // refresh attempt.
        if (isUnauthorized && !originalRequest._retry && !isPublicAuthEndpoint(url)) {
          originalRequest._retry = true;
          this.isRefreshing = true;
          const generation = this.authGeneration;
          const refreshController = new AbortController();
          this.refreshController = refreshController;
          const startedAt = Date.now();
          const hadCredentials = Boolean(
            this.authTokens.accessToken || this.authTokens.refreshToken,
          );

          try {
            const newAccessToken = await withRequestDeadline(async (signal, timeout) => {
              const assertCurrent = () => {
                if (signal.aborted || generation !== this.authGeneration) throw readAbortError();
              };
              const latestRefreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY) || this.authTokens.refreshToken;
              assertCurrent();
              if (!latestRefreshToken) throw new Error('No refresh token available');
              const { data } = await this.refreshClient.post('/api/auth/refresh', {
                refresh_token: latestRefreshToken,
              }, { signal, timeout });
              assertCurrent();
              const token = data.access_token;
              if (typeof token !== 'string' || token.length === 0) {
                throw new Error('Refresh response did not include an access token');
              }
              await this.persistAuthTokens(token);
              assertCurrent();
              return token;
            },
              { timeoutMs: 15_000, signal: refreshController.signal },
            );
            if (generation !== this.authGeneration) return Promise.reject(readAbortError());
            
            this.isRefreshing = false;
            this.refreshController = null;
            this.processQueue(null, newAccessToken);

            // The initiating read may have been cancelled while a shared
            // refresh, still needed by other callers, completed successfully.
            if (originalRequest.signal?.aborted) return Promise.reject(readAbortError());
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return this.api(originalRequest);
          } catch (refreshError) {
            // AuthContext has already transitioned identity. Obsolete refresh
            // work must neither install old credentials nor log out the new user.
            if (generation !== this.authGeneration) return Promise.reject(readAbortError());
            if (!hadCredentials && !this.authTokens.accessToken && !this.authTokens.refreshToken) {
              this.invalidatePendingRefresh();
              return Promise.reject(error);
            }
            // Clearing immediately retires the logical refresh and queue. OS
            // storage may not be cancellable; its FIFO cleanup can finish later.
            const clearing = this.clearAndNotifyAuthInvalidated();
            const remainingMs = 15_000 - (Date.now() - startedAt);
            try {
              if (remainingMs > 0) {
                await withRequestDeadline(() => clearing, { timeoutMs: remainingMs });
              } else {
                void clearing.catch(() => undefined);
              }
            } catch {
              // In-memory credentials are cleared before storage operations;
              // auth observers must still be allowed to end the session.
            }
            return Promise.reject(error);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  private processQueue(error: any, token: string | null): void {
    this.failedQueue.forEach(prom => {
      prom.cleanup();
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve(token);
      }
    });
    this.failedQueue = [];
  }

  private emitAuthInvalidated(): void {
    if (this.authInvalidationEmitted) return;
    this.authInvalidationEmitted = true;
    this.authInvalidationListeners.forEach((listener) => {
      try {
        listener();
      } catch (error) {
        console.error('Error in auth invalidation listener:', error);
      }
    });
  }

  private async clearAndNotifyAuthInvalidated(): Promise<void> {
    const clearing = this.clearAuthTokens();
    const generation = this.authGeneration;
    try {
      await clearing;
    } finally {
      if (generation === this.authGeneration) this.emitAuthInvalidated();
    }
  }

  onAuthInvalidated(listener: AuthInvalidationListener): () => void {
    this.authInvalidationListeners.add(listener);
    return () => {
      this.authInvalidationListeners.delete(listener);
    };
  }

  async setAuthTokens(accessToken: string | null, refreshToken?: string | null): Promise<void> {
    this.invalidatePendingRefresh();
    await this.persistAuthTokens(accessToken, refreshToken);
  }

  private invalidatePendingRefresh(): void {
    this.authGeneration += 1;
    this.refreshController?.abort();
    this.refreshController = null;
    this.isRefreshing = false;
    this.processQueue(readAbortError(), null);
  }

  private async persistAuthTokens(accessToken: string | null, refreshToken?: string | null): Promise<void> {
    this.authTokens.accessToken = accessToken;
    if (typeof refreshToken !== 'undefined') {
      this.authTokens.refreshToken = refreshToken;
    }
    if (this.authTokens.accessToken || this.authTokens.refreshToken) {
      this.authInvalidationEmitted = false;
    }
    await this.mutateStorage(async () => {
      if (accessToken) await this.storage.setItem(ACCESS_TOKEN_KEY, accessToken);
      else await this.storage.removeItem(ACCESS_TOKEN_KEY);
      if (typeof refreshToken !== 'undefined') {
        if (refreshToken) await this.storage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        else await this.storage.removeItem(REFRESH_TOKEN_KEY);
      }
    });
  }

  /** Preserve identity-write ordering even if native storage resolves slowly. */
  private mutateStorage(operation: () => Promise<void>): Promise<void> {
    const work = this.storageMutation.then(operation, operation);
    this.storageMutation = work.catch(() => undefined);
    return work;
  }

  async clearAuthTokens(): Promise<void> {
    this.invalidatePendingRefresh();
    this.authTokens.accessToken = null;
    this.authTokens.refreshToken = null;
    await this.mutateStorage(async () => {
      const results = await Promise.allSettled([
        this.storage.removeItem(ACCESS_TOKEN_KEY),
        this.storage.removeItem(REFRESH_TOKEN_KEY),
      ]);
      const failed = results.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failed != null) throw failed.reason;
    });
  }

  async getStoredTokens(): Promise<{ accessToken: string | null; refreshToken: string | null }> {
    await this.storageMutation;
    const generation = this.authGeneration;
    const accessToken = await this.storage.getItem(ACCESS_TOKEN_KEY);
    const refreshToken = await this.storage.getItem(REFRESH_TOKEN_KEY);
    if (generation === this.authGeneration) this.authTokens = { accessToken, refreshToken };
    return { ...this.authTokens };
  }

  // Expose axios instance for direct use
  get axiosInstance(): AxiosInstance {
    return this.api;
  }
}
