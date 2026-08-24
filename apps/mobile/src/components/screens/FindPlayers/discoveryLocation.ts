import type { Location } from '@beach-kings/shared';
import type { Coords } from '@/hooks/useDeviceLocation';

const EARTH_RADIUS_MILES = 3958.8;

export const DISCOVERY_RADII = [10, 25, 50, 100] as const;
export type DiscoverRadius = (typeof DISCOVERY_RADII)[number];

function radians(value: number): number {
  return (value * Math.PI) / 180;
}

export function hubDistanceMiles(a: Coords, b: Coords): number {
  const latitudeA = radians(a.latitude);
  const latitudeB = radians(b.latitude);
  const deltaLatitude = latitudeB - latitudeA;
  const deltaLongitude = radians(b.longitude - a.longitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2
    + Math.cos(latitudeA)
      * Math.cos(latitudeB)
      * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

/** Chooses a catalog hub locally; raw device coordinates never enter an API call. */
export function findNearestHub(
  locations: readonly Location[],
  coords: Coords | null,
): Location | null {
  if (coords == null) return null;

  let nearest: Location | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const location of locations) {
    const latitude = location.latitude;
    const longitude = location.longitude;
    if (
      typeof latitude !== 'number'
      || !Number.isFinite(latitude)
      || typeof longitude !== 'number'
      || !Number.isFinite(longitude)
    ) {
      continue;
    }
    const distance = hubDistanceMiles(coords, { latitude, longitude });
    if (distance < nearestDistance) {
      nearest = location;
      nearestDistance = distance;
    }
  }
  return nearest;
}

export function formatMetroLabel(location: Location): string {
  if (location.name?.trim()) return location.name.trim();
  return [location.city, location.state].filter(Boolean).join(', ');
}
