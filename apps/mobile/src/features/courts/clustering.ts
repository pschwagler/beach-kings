import Supercluster from 'supercluster';
import type { BBox, Feature, Point } from 'geojson';
import type { Court } from '@beach-kings/shared';
import type { CourtWithCoords, Region } from '@/utils/mapRegion';

export interface CourtPointProperties {
  readonly court: CourtWithCoords;
}

export type CourtPoint = Feature<Point, CourtPointProperties>;
export type CourtClusterIndex = Supercluster<CourtPointProperties>;

const MIN_ZOOM = 0;
const MAX_ZOOM = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeLongitude(longitude: number): number {
  return ((longitude + 180) % 360 + 360) % 360 - 180;
}

export function regionToZoom(region: Region): number {
  const delta = clamp(Math.abs(region.longitudeDelta), 0.000_001, 360);
  return clamp(Math.round(Math.log2(360 / delta)), MIN_ZOOM, MAX_ZOOM);
}

/** Returns one bbox normally and two when the visible region crosses ±180°. */
export function regionToBoundingBoxes(region: Region): readonly BBox[] {
  const south = clamp(region.latitude - region.latitudeDelta / 2, -90, 90);
  const north = clamp(region.latitude + region.latitudeDelta / 2, -90, 90);

  if (region.longitudeDelta >= 360) return [[-180, south, 180, north]];

  const rawWest = region.longitude - region.longitudeDelta / 2;
  const rawEast = region.longitude + region.longitudeDelta / 2;
  const west = normalizeLongitude(rawWest);
  const east = normalizeLongitude(rawEast);

  if (rawWest < -180 || west > east) {
    return [
      [west, south, 180, north],
      [-180, south, east, north],
    ];
  }
  if (rawEast > 180) {
    return [
      [west, south, 180, north],
      [-180, south, east, north],
    ];
  }
  return [[west, south, east, north]];
}

export function createCourtClusterIndex(courts: readonly CourtWithCoords[]): CourtClusterIndex {
  const points: CourtPoint[] = courts.map((court) => ({
    type: 'Feature',
    id: String(court.id),
    properties: { court },
    geometry: {
      type: 'Point',
      coordinates: [court.longitude, court.latitude],
    },
  }));

  return new Supercluster<CourtPointProperties>({
    radius: 48,
    maxZoom: MAX_ZOOM,
  }).load(points);
}

export function clustersForRegion(index: CourtClusterIndex, region: Region) {
  const zoom = regionToZoom(region);
  const clusters = regionToBoundingBoxes(region).flatMap((bbox) =>
    index.getClusters(bbox, zoom),
  );
  return Array.from(
    new Map(
      clusters.map((feature) => [
        `${isCourtPoint(feature) ? 'court' : 'cluster'}:${String(feature.id)}`,
        feature,
      ]),
    ).values(),
  );
}

export function regionForCluster(
  coordinate: readonly [number, number],
  expansionZoom: number,
): Region {
  const delta = clamp(360 / 2 ** expansionZoom, 0.002, 60);
  return {
    latitude: coordinate[1],
    longitude: coordinate[0],
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export function isCourtPoint(
  feature: ReturnType<CourtClusterIndex['getClusters']>[number],
): feature is CourtPoint {
  return !('cluster' in feature.properties) || feature.properties.cluster !== true;
}
