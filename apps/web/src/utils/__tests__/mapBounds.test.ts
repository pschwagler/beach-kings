import { describe, expect, it } from 'vitest';

import {
  boundsAround,
  fitMapBounds,
  normalizeMapBounds,
  toMapboxBounds,
} from '../mapBounds';

describe('map bounds', () => {
  it('preserves ordinary bounds', () => {
    expect(normalizeMapBounds({
      north: 41,
      south: 40,
      west: -75,
      east: -73,
    })).toEqual({ north: 41, south: 40, west: -75, east: -73 });
  });

  it('normalizes an eastward Mapbox range into crossing API bounds', () => {
    expect(normalizeMapBounds({
      north: 10,
      south: -10,
      west: 179,
      east: 181,
    })).toEqual({ north: 10, south: -10, west: 179, east: -179 });
  });

  it('fits +179 and -179 over the smallest immutable arc', () => {
    const coordinates = [
      { latitude: 1, longitude: 179 },
      { latitude: -1, longitude: -179 },
    ] as const;
    const before = coordinates.map((coordinate) => ({ ...coordinate }));

    const bounds = fitMapBounds(coordinates);

    expect(coordinates).toEqual(before);
    expect(bounds?.west).toBeCloseTo(178.97);
    expect(bounds?.east).toBeCloseTo(-178.97);
    expect(bounds!.west).toBeGreaterThan(bounds!.east);
  });

  it('keeps nearby bounds crossing when centered beside the date line', () => {
    const bounds = boundsAround(0, 179.9, 25);

    expect(bounds.west).toBeGreaterThan(bounds.east);
    expect(bounds.east).toBeGreaterThanOrEqual(-180);
  });

  it('unwraps crossing API bounds for Mapbox fitBounds', () => {
    expect(toMapboxBounds({
      north: 10,
      south: -10,
      west: 179,
      east: -179,
    })).toEqual([[179, -10], [181, 10]]);
  });
});
