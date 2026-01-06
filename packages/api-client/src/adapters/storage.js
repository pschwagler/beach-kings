/**
 * Storage adapter interface for platform-specific token storage
 * Implementations: web (localStorage), mobile (expo-secure-store)
 */

/**
 * Storage adapter interface
 * @typedef {Object} StorageAdapter
 * @property {function(string, string): Promise<void>} setItem - Store a value
 * @property {function(string): Promise<string|null>} getItem - Retrieve a value
 * @property {function(string): Promise<void>} removeItem - Remove a value
 */

/**
 * Web storage adapter using localStorage
 */
export const webStorageAdapter = {
  async setItem(key, value) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  },
  
  async getItem(key) {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
    return null;
  },
  
  async removeItem(key) {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  },
};

/**
 * Default storage adapter (web)
 * Mobile apps should override this with expo-secure-store adapter
 */
let storageAdapter = webStorageAdapter;

/**
 * Set the storage adapter to use
 * @param {StorageAdapter} adapter - The storage adapter to use
 */
export function setStorageAdapter(adapter) {
  storageAdapter = adapter;
}

/**
 * Get the current storage adapter
 * @returns {StorageAdapter}
 */
export function getStorageAdapter() {
  return storageAdapter;
}
