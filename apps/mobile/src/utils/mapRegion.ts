/**
 * Shared map-region math for the courts maps.
 *
 * Extracted from CourtsMapView so the full-screen map, the list-header preview,
 * and the court-detail card all compute regions the same way.
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

/** Computes the region that fits all supplied coordinates, or null when empty. */
export function fitRegion(coords: readonly LatLng[]): Region | null {
  if (coords.length === 0) return null;

  const lats = coords.map((c) => c.latitude);
  const lons = coords.map((c) => c.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: Math.max(maxLat - minLat + REGION_PADDING, MIN_DELTA),
    longitudeDelta: Math.max(maxLon - minLon + REGION_PADDING, MIN_DELTA),
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

/** Tight region centered on a single coordinate. */
export function singlePinRegion(coord: LatLng): Region {
  return {
    latitude: coord.latitude,
    longitude: coord.longitude,
    latitudeDelta: SINGLE_PIN_DELTA,
    longitudeDelta: SINGLE_PIN_DELTA,
  };
}
