/**
 * Storage adapter interface for platform-agnostic token storage
 * This allows the API client to work with both web (localStorage) and mobile (SecureStore)
 */

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Web storage adapter using localStorage
 */
export class WebStorageAdapter implements StorageAdapter {
  async getItem(key: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  }

  async setItem(key: string, value: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(key, value);
  }

  async removeItem(key: string): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(key);
  }
}

/**
 * Mobile storage adapter using Expo SecureStore
 * This will be implemented in the mobile app
 */
export class MobileStorageAdapter implements StorageAdapter {
  private secureStore: any;

  constructor(secureStore: any) {
    this.secureStore = secureStore;
  }

  async getItem(key: string): Promise<string | null> {
    try {
      return await this.secureStore.getItemAsync(key);
    } catch (error) {
      console.error('Error reading from secure store:', error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      await this.secureStore.setItemAsync(key, value);
    } catch (error) {
      console.error('Error writing to secure store:', error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      await this.secureStore.deleteItemAsync(key);
    } catch (error) {
      console.error('Error removing from secure store:', error);
    }
  }
}



