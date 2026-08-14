export interface MapBounds {
  readonly north: number;
  readonly south: number;
  readonly east: number;
  readonly west: number;
}

export interface MapCoordinate {
  readonly latitude: number;
  readonly longitude: number;
}

export function normalizeLongitude(longitude: number): number {
  const normalized = ((longitude + 180) % 360 + 360) % 360 - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

/** Canonical API bounds; west > east intentionally means crossing the date line. */
export function normalizeMapBounds(bounds: MapBounds): MapBounds {
  if (Math.abs(bounds.east - bounds.west) >= 360) {
    return { ...bounds, west: -180, east: 180 };
  }
  return {
    ...bounds,
    west: normalizeLongitude(bounds.west),
    east: normalizeLongitude(bounds.east),
  };
}

export function boundsAround(
  latitude: number,
  longitude: number,
  miles = 25,
): MapBounds {
  const latDelta = miles / 69;
  const lngDelta = miles / Math.max(
    20,
    69 * Math.cos(latitude * Math.PI / 180),
  );
  return normalizeMapBounds({
    north: Math.min(90, latitude + latDelta),
    south: Math.max(-90, latitude - latDelta),
    east: longitude + lngDelta,
    west: longitude - lngDelta,
  });
}

/** Fits coordinates using the smallest circular longitude arc. */
export function fitMapBounds(
  coordinates: readonly MapCoordinate[],
  padding = 0.03,
): MapBounds | null {
  if (coordinates.length === 0) return null;

  const latitudes = coordinates.map(({ latitude }) => latitude);
  const longitudes = coordinates
    .map(({ longitude }) => ((longitude % 360) + 360) % 360)
    .sort((a, b) => a - b);

  let largestGap = -1;
  let arcStart = longitudes[0]!;
  for (let index = 0; index < longitudes.length; index += 1) {
    const current = longitudes[index]!;
    const next = index === longitudes.length - 1
      ? longitudes[0]! + 360
      : longitudes[index + 1]!;
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      arcStart = next % 360;
    }
  }

  const span = 360 - largestGap;
  const center = arcStart + span / 2;
  return normalizeMapBounds({
    north: Math.min(90, Math.max(...latitudes) + padding),
    south: Math.max(-90, Math.min(...latitudes) - padding),
    west: center - span / 2 - padding,
    east: center + span / 2 + padding,
  });
}

/** Unwraps crossing API bounds into the eastward pair expected by Mapbox. */
export function toMapboxBounds(
  bounds: MapBounds,
): [[number, number], [number, number]] {
  const normalized = normalizeMapBounds(bounds);
  const east = normalized.east < normalized.west
    ? normalized.east + 360
    : normalized.east;
  return [
    [normalized.west, normalized.south],
    [east, normalized.north],
  ];
}
