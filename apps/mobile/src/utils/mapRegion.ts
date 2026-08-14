/**
 * Shared map-region math for the courts maps.
 *
 * Extracted from CourtsMapView so the court directory and court-detail preview
 * compute regions the same way.
 */

import type { Court } from '@beach-kings/shared';

export interface LatLng {
  readonly latitude: number;
  readonly longitude: number;
}

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/** Padding added around a bounding box so pins aren't clipped at the edges. */
export const REGION_PADDING = 0.05;

/** Minimum delta so a single tight cluster doesn't zoom in absurdly far. */
export const MIN_DELTA = 0.05;

/** Delta used when framing a single pin (~1 km view). */
export const SINGLE_PIN_DELTA = 0.008;

/** City-scale framing used by the courts directory's Nearby mode. */
export const DIRECTORY_NEARBY_DELTA = 0.35;

/** Default region (continental US) used when no pins exist. */
export const DEFAULT_REGION: Region = {
  latitude: 37.5,
  longitude: -98.0,
  latitudeDelta: 40,
  longitudeDelta: 60,
};

/** A court guaranteed to carry numeric coordinates. */
export type CourtWithCoords = Court & { latitude: number; longitude: number };

/** Filters courts down to those with valid latitude + longitude. */
export function courtsWithCoords(courts: readonly Court[]): CourtWithCoords[] {
  return courts.filter(
    (c): c is CourtWithCoords => c.latitude != null && c.longitude != null,
  );
}

interface LongitudeArc {
  readonly center: number;
  readonly span: number;
}

/** Normalizes a longitude to the conventional [-180, 180) range. */
function normalizeLongitude(longitude: number): number {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/**
 * Finds the smallest circular arc containing every longitude.
 *
 * The input is copied before sorting, so callers' coordinate arrays remain
 * untouched. The uncovered portion of the globe is the largest gap between
 * adjacent longitudes; its complement is the desired map span.
 */
function smallestLongitudeArc(longitudes: readonly number[]): LongitudeArc {
  if (longitudes.length === 1) {
    return { center: longitudes[0]!, span: 0 };
  }

  const sorted = longitudes
    .map((longitude) => ((longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);

  let largestGap = -1;
  let arcStart = sorted[0]!;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index]!;
    const next =
      index === sorted.length - 1 ? sorted[0]! + 360 : sorted[index + 1]!;
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      arcStart = next % 360;
    }
  }

  const span = 360 - largestGap;
  return {
    center: normalizeLongitude(arcStart + span / 2),
    span,
  };
}

/** Computes the region that fits all supplied coordinates, or null when empty. */
export function fitRegion(coords: readonly LatLng[]): Region | null {
  if (coords.length === 0) return null;

  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const longitudeArc = smallestLongitudeArc(lons);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: longitudeArc.center,
    latitudeDelta: Math.max(maxLat - minLat + REGION_PADDING, MIN_DELTA),
    longitudeDelta: Math.max(
      Math.min(longitudeArc.span + REGION_PADDING, 360),
      MIN_DELTA,
    ),
  };
}

/**
 * Determines the initial region for a courts map.
 *
 * Includes the user's location (when known) in the bounding box, then falls
 * back to fitting only the court pins, then to the continental-US default.
 */
export function computeRegion(
  courtCoords: readonly LatLng[],
  userLocation: LatLng | null | undefined,
): Region {
  const allCoords = userLocation != null ? [userLocation, ...courtCoords] : courtCoords;
  return fitRegion(allCoords) ?? DEFAULT_REGION;
}

/**
 * Preferred framing for the courts directory. Search and non-nearby filters
 * deliberately exclude the player location from their result bounds.
 */
export function directoryMapRegion(
  courts: readonly Court[],
  userLocation: LatLng | null,
  searchQuery: string,
  activeFilter: string | null,
): Region {
  const isNearbyBrowse = searchQuery.trim().length === 0 &&
    (activeFilter == null || activeFilter === 'nearby');
  if (isNearbyBrowse) {
    return userLocation == null
      ? DEFAULT_REGION
      : {
          ...userLocation,
          latitudeDelta: DIRECTORY_NEARBY_DELTA,
          longitudeDelta: DIRECTORY_NEARBY_DELTA,
        };
  }

  return fitRegion(
    courtsWithCoords(courts).map(({ latitude, longitude }) => ({ latitude, longitude })),
  ) ?? DEFAULT_REGION;
}

/** Tight region centered on a single coordinate. */
export function singlePinRegion(coord: LatLng): Region {
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    latitudeDelta: SINGLE_PIN_DELTA,
    longitudeDelta: SINGLE_PIN_DELTA,
  };
}
