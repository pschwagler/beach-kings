import { queryOptions } from '@tanstack/react-query';
import type { Court, CourtPhoto } from '@beach-kings/shared';

import { api } from '@/lib/api';
import { courtKeys } from './keys';

export interface CourtQueryCoords {
  readonly latitude: number;
  readonly longitude: number;
}

const COURT_CATALOG_STALE_TIME_MS = 5 * 60_000;

export interface CourtPhotosQueryData {
  readonly court: Court | null;
  readonly photos: readonly CourtPhoto[];
}

export interface CourtReviewTag {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
  readonly category: string;
  readonly sort_order: number;
}

/** Shared, complete court catalog for distance-aware selection workflows. */
export const courtQueries = {
  catalog: (
    userId: number,
    coords: CourtQueryCoords | null,
    enabled = true,
  ) => queryOptions({
    queryKey: courtKeys.catalog(
      userId,
      coords?.latitude ?? null,
      coords?.longitude ?? null,
    ),
    queryFn: (): Promise<Court[]> =>
      api.getCourts(
        coords == null
          ? { all: true }
          : {
              user_lat: coords.latitude,
              user_lng: coords.longitude,
              all: true,
            },
      ),
    enabled: enabled && userId > 0,
    staleTime: COURT_CATALOG_STALE_TIME_MS,
  }),
  nearby: (
    userId: number,
    coords: CourtQueryCoords | null,
    locationId: string | null,
    enabled = true,
  ) => queryOptions({
    queryKey: courtKeys.nearby(
      userId,
      coords?.latitude ?? null,
      coords?.longitude ?? null,
      coords == null ? locationId : null,
    ),
    queryFn: (): Promise<Court[]> =>
      api.getCourts(
        coords == null
          ? { location_id: locationId }
          : { user_lat: coords.latitude, user_lng: coords.longitude },
      ),
    enabled: enabled && userId > 0,
    staleTime: COURT_CATALOG_STALE_TIME_MS,
  }),
  placeholder: (
    userId: number,
    locationId: string | null,
    enabled = true,
  ) => queryOptions({
    queryKey: courtKeys.placeholder(userId, locationId ?? ''),
    queryFn: (): Promise<Court> => api.getPlaceholderCourt(locationId ?? ''),
    enabled: enabled && userId > 0 && locationId != null && locationId.length > 0,
    staleTime: COURT_CATALOG_STALE_TIME_MS,
  }),
  reviewTags: (enabled = true) => queryOptions({
    queryKey: courtKeys.reviewTags(),
    queryFn: (): Promise<CourtReviewTag[]> => api.getCourtTags(),
    enabled,
    staleTime: Infinity,
  }),
  detail: (userId: number, idOrSlug: number | string, enabled = true) =>
    queryOptions({
      queryKey: courtKeys.detail(userId, idOrSlug),
      queryFn: (): Promise<Court> => api.getCourtById(idOrSlug),
      enabled: enabled && userId > 0 && String(idOrSlug).length > 0,
      staleTime: COURT_CATALOG_STALE_TIME_MS,
    }),
  photos: (userId: number, idOrSlug: number | string, enabled = true) =>
    queryOptions({
      queryKey: courtKeys.photos(userId, idOrSlug),
      queryFn: async (): Promise<CourtPhotosQueryData> => {
        const [photos, court] = await Promise.all([
          api.getCourtPhotos(idOrSlug),
          api.getCourtById(idOrSlug).catch(() => null as Court | null),
        ]);
        return { photos, court };
      },
      enabled: enabled && userId > 0 && String(idOrSlug).length > 0,
      staleTime: COURT_CATALOG_STALE_TIME_MS,
    }),
} as const;
