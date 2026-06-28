/**
 * Tests for the shared map-region math in @/utils/mapRegion.
 */
import {
  fitRegion,
  computeRegion,
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
