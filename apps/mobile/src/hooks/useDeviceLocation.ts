/**
 * Requests the device's current GPS coordinates via `expo-location`.
 *
 * Centralizes the foreground-permission + `getCurrentPositionAsync` dance that
 * was previously copy-pasted across screens. Any failure (denied permission,
 * services off, timeout) is non-fatal: it resolves to `status: 'denied'` with
 * `coords: null` so callers can fall back to another location source.
 */

import { useEffect, useState } from 'react';
import * as ExpoLocation from 'expo-location';

export interface Coords {
  readonly latitude: number;
  readonly longitude: number;
}

export type DeviceLocationStatus = 'pending' | 'granted' | 'denied';

export interface UseDeviceLocationResult {
  readonly coords: Coords | null;
  readonly status: DeviceLocationStatus;
}

export interface UseDeviceLocationOptions {
  /** When false, skips the permission request entirely (status stays 'pending'). */
  readonly enabled?: boolean;
}

/** Resolves device coordinates once on mount. */
export function useDeviceLocation(
  options: UseDeviceLocationOptions = {},
): UseDeviceLocationResult {
  const { enabled = true } = options;
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<DeviceLocationStatus>('pending');

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    async function resolve(): Promise<void> {
      try {
        const { status: permission } =
          await ExpoLocation.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (permission !== 'granted') {
          setStatus('denied');
          return;
        }

        const position = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        if (cancelled) return;

        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setStatus('granted');
      } catch {
        // Any failure is non-fatal — fall back to another location source.
        if (!cancelled) setStatus('denied');
      }
    }

    void resolve();
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { coords, status };
}
