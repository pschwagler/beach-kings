import { useState, useEffect, useRef } from 'react';

/**
 * Centralized hook for resolving the user's geographic position.
 *
 * Priority: browser geolocation → player profile coords → null.
 *
 * Returns `{ position, source }` where:
 * - `position` is `{ latitude, longitude }` or `null`
 * - `source` is `'geolocation'`, `'profile'`, or `null`
 *
 * @param {Object} [profileCoords] - Fallback from player profile: { latitude, longitude }
 * @param {Object} [options]
 * @param {boolean} [options.skipGeolocation=false] - Skip browser geolocation (use profile only)
 * @param {number} [options.timeout=5000] - Geolocation timeout in ms
 */
interface Coords {
  latitude: number;
  longitude: number;
}

interface UseUserPositionOptions {
  skipGeolocation?: boolean;
  timeout?: number;
}

export function useUserPosition(
  profileCoords: Coords | null = null,
  options: UseUserPositionOptions = {},
) {
  const { skipGeolocation = false, timeout = 5000 } = options;
  const geoAttempted = useRef(false);

  const [position, setPosition] = useState(profileCoords || null);
  const [source, setSource] = useState(profileCoords ? 'profile' : null);

  // Attempt browser geolocation once
  useEffect(() => {
    if (skipGeolocation || geoAttempted.current) return;
    geoAttempted.current = true;

    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        setSource('geolocation');
      },
      () => {}, // silently fall back to profile
      { timeout, maximumAge: 300000 }
    );
  }, [skipGeolocation, timeout]);

  // Update if profile coords arrive after initial render.
  // Depend on primitive lat/lng to avoid infinite loops when callers pass a new object each render.
  const profileLat = profileCoords?.latitude;
  const profileLng = profileCoords?.longitude;
  useEffect(() => {
    if (source === 'geolocation') return; // geo takes priority
    if (profileLat && profileLng) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync prop to local state
      setPosition((prev) => {
        if (prev?.latitude === profileLat && prev?.longitude === profileLng) return prev;
        return { latitude: profileLat, longitude: profileLng };
      });
      setSource('profile');
    }
  }, [profileLat, profileLng, source]);

  return { position, source };
}
