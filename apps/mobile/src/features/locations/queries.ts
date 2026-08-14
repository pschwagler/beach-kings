import { queryOptions } from '@tanstack/react-query';
import type { Location } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { locationKeys } from './keys';

const LOCATION_STALE_TIME_MS = 10 * 60 * 1000;

export const locationQueries = {
  all: () => queryOptions({
    queryKey: locationKeys.all(),
    queryFn: async (): Promise<readonly Location[]> => api.getLocations(),
    staleTime: LOCATION_STALE_TIME_MS,
  }),
} as const;
