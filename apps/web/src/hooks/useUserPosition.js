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
export function useUserPosition(profileCoords = null, options = {}) {
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

  // Update if profile coords arrive after initial render
  useEffect(() => {
    if (source === 'geolocation') return; // geo takes priority
    if (profileCoords?.latitude && profileCoords?.longitude) {
      setPosition(profileCoords);
      setSource('profile');
    }
  }, [profileCoords?.latitude, profileCoords?.longitude, source]);

  return { position, source };
}
