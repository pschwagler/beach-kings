/**
 * Mobile storage adapter using expo-secure-store
 * This adapter provides secure token storage for the mobile app
 */

import * as SecureStore from 'expo-secure-store';

/**
 * Mobile storage adapter using expo-secure-store
 */
export const mobileStorageAdapter = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.error(`Error storing ${key}:`, error);
      throw error;
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.error(`Error retrieving ${key}:`, error);
      return null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.error(`Error removing ${key}:`, error);
      // Don't throw - removal is best effort
    }
  },
};

