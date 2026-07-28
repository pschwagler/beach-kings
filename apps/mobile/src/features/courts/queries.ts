import { queryOptions } from '@tanstack/react-query';
import type { Court } from '@beach-kings/shared';

import { api } from '@/lib/api';
import { courtKeys } from './keys';

interface CourtPickerCoords {
  readonly latitude: number;
  readonly longitude: number;
}

const COURT_CATALOG_STALE_TIME_MS = 5 * 60_000;

/** Shared, complete court catalog for distance-aware selection workflows. */
export const courtQueries = {
  picker: (
    coords: CourtPickerCoords | null,
    enabled = true,
  ) => queryOptions({
    queryKey: courtKeys.picker(
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
    enabled,
    staleTime: COURT_CATALOG_STALE_TIME_MS,
  }),
} as const;
