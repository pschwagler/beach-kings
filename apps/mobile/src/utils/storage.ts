/**
 * Secure storage helpers backed by expo-secure-store.
 *
 * Values are encrypted at rest using the device's secure enclave (Keychain
 * on iOS, Keystore on Android). Use for tokens, credentials, and other
 * sensitive data.
 *
 * All functions propagate errors from the underlying store so callers can
 * decide how to handle failures (e.g. fall back to a re-login flow).
 */
import * as SecureStore from 'expo-secure-store';

/**
 * Retrieves a value by key from secure storage.
 *
 * @param key - Storage key.
 * @returns The stored string, or `null` if the key does not exist.
 */
export async function getItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key);
}

/**
 * Persists a string value in secure storage.
 *
 * @param key - Storage key.
 * @param value - UTF-8 string to store.
 */
export async function setItem(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

/**
 * Deletes a key/value pair from secure storage.
 *
 * No-op if the key does not exist.
 *
 * @param key - Storage key to remove.
 */
export async function removeItem(key: string): Promise<void> {
  await SecureStore.deleteItemAsync(key);
}
