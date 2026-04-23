/**
 * API client singleton for the mobile app.
 * Uses expo-secure-store for token persistence.
 *
 * The singleton is lazily constructed on first access: merely importing this
 * module does NOT pull axios into the caller's module graph. This keeps the
 * jest test runner happy (axios's fetch adapter probes the runtime at
 * module-init time and trips over jest-expo's streams polyfill) and means
 * presentational components can freely import `api` without forcing every
 * consumer to mock it.
 *
 * Missing-backend methods fall through to `mockApi`: when a key isn't defined
 * on the real api-client, the Proxy returns the matching function from
 * `mockApi` instead. When the backend lands, delete the mock entry and the
 * real method takes over automatically.
 */

import type { createApiClient } from '@beach-kings/api-client';
import { mockApi, type MockApi } from './mockApi';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

type ApiClient = ReturnType<typeof createApiClient>;

let instance: ApiClient | null = null;

function getApi(): ApiClient {
  if (!instance) {
    // Deferred `require` — keeps axios out of the module graph until someone
    // actually calls an api method. Type-only `import` above gets erased.
    const {
      createApiClient: create,
      MobileStorageAdapter,
    } = require('@beach-kings/api-client') as typeof import('@beach-kings/api-client');
    const SecureStore =
      require('expo-secure-store') as typeof import('expo-secure-store');
    instance = create(API_BASE_URL, new MobileStorageAdapter(SecureStore));
  }
  return instance;
}

type ExtendedApi = ApiClient & MockApi;

export const api = new Proxy({} as ExtendedApi, {
  get(_target, prop) {
    const real = getApi();
    const realValue = real[prop as keyof ApiClient];
    if (realValue !== undefined) return realValue;
    return mockApi[prop as keyof MockApi];
  },
}) as ExtendedApi;
