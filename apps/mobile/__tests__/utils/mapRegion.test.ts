/**
 * Tests for the shared map-region math in @/utils/mapRegion.
 */
import {
  fitRegion,
  computeRegion,
  directoryMapRegion,
  DIRECTORY_NEARBY_DELTA,
  courtsWithCoords,
  singlePinRegion,
  DEFAULT_REGION,
  MIN_DELTA,
  SINGLE_PIN_DELTA,
} from '@/utils/mapRegion';
import type { Court } from '@beach-kings/shared';

function court(partial: Partial<Court>): Court {
  return { id: 1, name: 'C', ...partial } as Court;
}

describe('courtsWithCoords', () => {
  it('keeps only courts with both lat and lng', () => {
    const courts = [
      court({ id: 1, latitude: 1, longitude: 2 }),
      court({ id: 2, latitude: null, longitude: 2 }),
      court({ id: 3, latitude: 1, longitude: null }),
      court({ id: 4 }),
    ];
    const result = courtsWithCoords(courts);
    expect(result.map((c) => c.id)).toEqual([1]);
  });
});

describe('fitRegion', () => {
  it('returns null for an empty list', () => {
    expect(fitRegion([])).toBeNull();
  });

  it('centers on a single coordinate with the minimum delta', () => {
    const region = fitRegion([{ latitude: 10, longitude: 20 }]);
    expect(region?.latitude).toBe(10);
    expect(region?.longitude).toBe(20);
    expect(region?.latitudeDelta).toBe(MIN_DELTA);
    expect(region?.longitudeDelta).toBe(MIN_DELTA);
  });

  it('computes the midpoint and padded span of multiple coordinates', () => {
    const region = fitRegion([
      { latitude: 0, longitude: 0 },
      { latitude: 10, longitude: 20 },
    ]);
    expect(region?.latitude).toBe(5);
    expect(region?.longitude).toBe(10);
    expect(region?.latitudeDelta).toBeGreaterThan(10);
    expect(region?.longitudeDelta).toBeGreaterThan(20);
  });

  it('fits date-line coordinates over the smallest longitude arc', () => {
    const region = fitRegion([
      { latitude: 0, longitude: 179 },
      { latitude: 10, longitude: -179 },
    ]);

    expect(Math.abs(region?.longitude ?? 0)).toBe(180);
    expect(region?.longitudeDelta).toBeCloseTo(2.05);
    expect(region?.latitude).toBe(5);
  });

  it('treats wrapped longitudes as equivalent near the date line', () => {
    const region = fitRegion([
      { latitude: 0, longitude: 170 },
      { latitude: 0, longitude: -170 },
      { latitude: 0, longitude: 190 },
    ]);

    expect(Math.abs(region?.longitude ?? 0)).toBe(180);
    expect(region?.longitudeDelta).toBeCloseTo(20.05);
  });

  it('does not mutate the supplied coordinate order', () => {
    const coords = [
      { latitude: 0, longitude: 179 },
      { latitude: 0, longitude: -179 },
      { latitude: 0, longitude: 170 },
    ] as const;
    const before = coords.map((coord) => ({ ...coord }));

    fitRegion(coords);

    expect(coords).toEqual(before);
  });
});

describe('computeRegion', () => {
  it('falls back to the US default when there is nothing to fit', () => {
    expect(computeRegion([], null)).toEqual(DEFAULT_REGION);
  });

  it('includes the user location in the bounding box', () => {
    const region = computeRegion([{ latitude: 10, longitude: 10 }], {
      latitude: 0,
      longitude: 0,
    });
    expect(region.latitude).toBe(5);
    expect(region.longitude).toBe(5);
  });
});

describe('directoryMapRegion', () => {
  const local = { latitude: 40.7, longitude: -74 };
  const courts = [
    { id: 1, name: 'West', latitude: 34, longitude: -118 },
    { id: 2, name: 'East', latitude: 34.2, longitude: -117.8 },
  ] as never;

  it('centers nearby browsing on the player at city scale', () => {
    expect(directoryMapRegion(courts, local, '', null)).toEqual({
      ...local,
      latitudeDelta: DIRECTORY_NEARBY_DELTA,
      longitudeDelta: DIRECTORY_NEARBY_DELTA,
    });
  });

  it('fits remote search results without including player location', () => {
    const region = directoryMapRegion(courts, local, 'Los Angeles', null);
    expect(region.latitude).toBeCloseTo(34.1);
    expect(region.longitude).toBeCloseTo(-117.9);
  });

  it('fits non-nearby filtered results without including player location', () => {
    const region = directoryMapRegion(courts, local, '', 'lighted');
    expect(region.latitude).toBeCloseTo(34.1);
    expect(region.longitude).toBeCloseTo(-117.9);
  });

  it('uses the continental fallback when nearby location is unavailable', () => {
    expect(directoryMapRegion(courts, null, '', null)).toEqual(DEFAULT_REGION);
  });

  it('uses the continental fallback when matching results have no coordinates', () => {
    expect(directoryMapRegion([], local, 'missing', null)).toEqual(DEFAULT_REGION);
  });
});

describe('singlePinRegion', () => {
  it('frames a single pin with the tight delta', () => {
    expect(singlePinRegion({ latitude: 1, longitude: 2 })).toEqual({
      latitude: 1,
      longitude: 2,
      latitudeDelta: SINGLE_PIN_DELTA,
      longitudeDelta: SINGLE_PIN_DELTA,
    });
  });
});
