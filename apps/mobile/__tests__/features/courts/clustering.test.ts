import type { Court } from '@beach-kings/shared';
import {
  clustersForRegion,
  createCourtClusterIndex,
  isCourtPoint,
  regionForCluster,
  regionToBoundingBoxes,
  regionToZoom,
} from '@/features/courts/clustering';
import { courtsWithCoords, type CourtWithCoords } from '@/utils/mapRegion';

const court = (
  id: number,
  latitude: number | null,
  longitude: number | null,
): Court => ({ id, name: `Court ${id}`, latitude, longitude });

describe('court clustering', () => {
  it('filters missing coordinates before indexing', () => {
    expect(
      courtsWithCoords([
        court(1, 40.7, -74),
        court(2, null, -74),
        court(3, 40.7, null),
      ]).map((item) => item.id),
    ).toEqual([1]);
  });

  it('clusters nearby courts and keeps distant leaves separate', () => {
    const courts: CourtWithCoords[] = [
      court(1, 40.7000, -74.0000),
      court(2, 40.7001, -74.0001),
      court(3, 34.05, -118.24),
    ] as CourtWithCoords[];
    const index = createCourtClusterIndex(courts);
    const features = clustersForRegion(index, {
      latitude: 39,
      longitude: -96,
      latitudeDelta: 20,
      longitudeDelta: 60,
    });

    expect(features.some((feature) => !isCourtPoint(feature))).toBe(true);
    expect(features.some((feature) => isCourtPoint(feature))).toBe(true);
  });

  it('splits bounds that cross the antimeridian', () => {
    expect(
      regionToBoundingBoxes({
        latitude: 0,
        longitude: 179,
        latitudeDelta: 10,
        longitudeDelta: 8,
      }),
    ).toEqual([
      [175, -5, 180, 5],
      [-180, -5, -177, 5],
    ]);
  });

  it('maps narrower regions to higher zoom and frames cluster expansion', () => {
    expect(
      regionToZoom({ latitude: 0, longitude: 0, latitudeDelta: 1, longitudeDelta: 1 }),
    ).toBeGreaterThan(
      regionToZoom({ latitude: 0, longitude: 0, latitudeDelta: 20, longitudeDelta: 20 }),
    );
    expect(regionForCluster([-73.9, 40.7], 10)).toMatchObject({
      latitude: 40.7,
      longitude: -73.9,
    });
  });
});
