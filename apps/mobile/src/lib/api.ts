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
 * The Proxy exists only to preserve lazy construction. Every exposed method
 * must be implemented by `@beach-kings/api-client`; there is deliberately no
 * runtime mock-data fallback.
 */

import type { createApiClient } from '@beach-kings/api-client';
import { API_ORIGIN } from '@/config/apiOrigin';

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
    instance = create(API_ORIGIN, new MobileStorageAdapter(SecureStore));
  }
  return instance;
}

export const api = new Proxy({} as ApiClient, {
  get(_target, prop) {
    const real = getApi();
    return real[prop as keyof ApiClient];
  },
}) as ApiClient;
