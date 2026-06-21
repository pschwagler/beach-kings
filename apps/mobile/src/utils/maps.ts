/**
 * Utility for opening native maps with directions to a court location.
 *
 * iOS: uses Apple Maps (http://maps.apple.com/) — no API key required.
 * Android: uses Google Maps (https://maps.google.com/) — requires the
 *   GOOGLE_MAPS_API_KEY in app.config.ts / android.config when Android ships.
 *
 * Design: the URL-building functions are pure (no side effects) so they can
 * be unit-tested without mocking Linking. The exported `openDirections`
 * composes them with `Linking.openURL`.
 */

import { Linking, Platform } from 'react-native';

export interface DirectionsTarget {
  readonly latitude: number;
  readonly longitude: number;
  readonly name: string;
}

/**
 * Builds an Apple Maps URL for the given location.
 * Opens in Apple Maps on iOS.
 */
export function buildAppleMapsUrl(target: DirectionsTarget): string {
  const { latitude, longitude, name } = target;
  const q = encodeURIComponent(name);
  return `http://maps.apple.com/?ll=${latitude},${longitude}&q=${q}`;
}

/**
 * Builds a Google Maps URL for the given location.
 * Used on Android where Apple Maps is not available.
 */
export function buildGoogleMapsUrl(target: DirectionsTarget): string {
  const { latitude, longitude, name } = target;
  const q = encodeURIComponent(name);
  return `https://maps.google.com/?q=${q}&center=${latitude},${longitude}`;
}

/**
 * Builds the platform-appropriate maps URL.
 * iOS → Apple Maps; Android → Google Maps.
 */
export function buildMapsUrl(target: DirectionsTarget): string {
  return Platform.select({
    ios: buildAppleMapsUrl(target),
    android: buildGoogleMapsUrl(target),
    default: buildAppleMapsUrl(target),
  }) as string;
}

/**
 * Opens the device's native maps app with directions to the given location.
 *
 * On iOS, uses Apple Maps (no API key needed).
 * On Android, uses Google Maps (requires GOOGLE_MAPS_API_KEY in app config
 * — see apps/mobile/app.config.ts when Android shipping is ready).
 */
export async function openDirections(target: DirectionsTarget): Promise<void> {
  const url = buildMapsUrl(target);
  await Linking.openURL(url);
}
