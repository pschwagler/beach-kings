/**
 * Centralized resolver for "where is the user", used to distance-sort courts
 * and center maps. Mirrors the web app's `useUserPosition`, extended with two
 * deeper fallback tiers.
 *
 * Resolution priority (first available wins):
 *   1. device  — live GPS via expo-location
 *   2. city    — the player's geocoded city coordinates
 *   3. home_court — the player's #1 home court's coordinates
 *   4. hub     — the player's assigned location-hub centroid
 *
 * The home-court and hub fallbacks are only fetched when the player has no
 * city coordinates, so the common path makes zero extra requests. Device GPS,
 * once it resolves, always takes precedence over the profile-derived tiers.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useDeviceLocation, type Coords } from '@/hooks/useDeviceLocation';
import { currentPlayerKeys, useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import { useAuth } from '@/contexts/AuthContext';
import { publicKeys } from '@/infrastructure/query/keys';

export type { Coords } from '@/hooks/useDeviceLocation';

export type LocationSource = 'device' | 'city' | 'home_court' | 'hub';

export interface ResolvedUserLocation {
  /** Best available coordinates, or null when none can be resolved. */
  readonly coords: Coords | null;
  /** Which tier produced `coords`. */
  readonly source: LocationSource | null;
  /** True until the device-GPS attempt has settled (granted or denied). */
  readonly isResolving: boolean;
}

export interface UseResolvedUserLocationOptions {
  /**
   * Skip the device-GPS tier (and its permission prompt) and resolve from the
   * player's profile only. Useful on screens that shouldn't prompt for
   * location, e.g. the home dashboard.
   */
  readonly skipDevice?: boolean;
}

/** Returns a coords pair only when both values are present and finite. */
function toCoords(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
): Coords | null {
  if (latitude == null || longitude == null) return null;
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return null;
  return { latitude, longitude };
}

export function useResolvedUserLocation(
  options: UseResolvedUserLocationOptions = {},
): ResolvedUserLocation {
  const { skipDevice = false } = options;
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const device = useDeviceLocation({ enabled: !skipDevice });
  const player = useCurrentPlayer();

  const cityCoords = useMemo(
    () => toCoords(player.data?.city_latitude, player.data?.city_longitude),
    [player.data?.city_latitude, player.data?.city_longitude],
  );

  const playerId = player.data?.id ?? null;
  const locationId = player.data?.location_id ?? null;

  // Only reach for the deeper fallbacks when the player has no city coords.
  const needsFallback = player.isSuccess && cityCoords == null;

  const homeCourts = useQuery({
    queryKey: currentPlayerKeys.homeCourts(userId, playerId ?? 0),
    queryFn: () => api.getPlayerHomeCourts(playerId as number),
    enabled: needsFallback && playerId != null,
  });

  const locations = useQuery({
    queryKey: publicKeys.locations(),
    queryFn: () => api.getLocations(),
    enabled: needsFallback && locationId != null,
  });

  const homeCourtCoords = useMemo(() => {
    const courts = homeCourts.data ?? [];
    const first = courts.find(
      (c) => c.latitude != null && c.longitude != null,
    );
    return first ? toCoords(first.latitude, first.longitude) : null;
  }, [homeCourts.data]);

  const hubCoords = useMemo(() => {
    if (locationId == null) return null;
    const hub = (locations.data ?? []).find((l) => l.id === locationId);
    return hub ? toCoords(hub.latitude, hub.longitude) : null;
  }, [locations.data, locationId]);

  return useMemo<ResolvedUserLocation>(() => {
    const resolved: ReadonlyArray<[Coords | null, LocationSource]> = [
      [device.coords, 'device'],
      [cityCoords, 'city'],
      [homeCourtCoords, 'home_court'],
      [hubCoords, 'hub'],
    ];

    const match = resolved.find(([coords]) => coords != null);

    return {
      coords: match ? match[0] : null,
      source: match ? match[1] : null,
      isResolving: !skipDevice && device.status === 'pending',
    };
  }, [skipDevice, device.coords, device.status, cityCoords, homeCourtCoords, hubCoords]);
}
