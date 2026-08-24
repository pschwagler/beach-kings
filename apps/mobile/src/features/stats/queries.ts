import { queryOptions } from '@tanstack/react-query';
import type { MyStatsPayload } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { statsKeys, type MyStatsFilters } from './keys';

const STATS_STALE_TIME_MS = 30_000;

export const statsQueries = {
  my: (userId: number, filters: MyStatsFilters = {}, enabled = true) =>
    queryOptions({
      queryKey: statsKeys.my(userId, filters),
      queryFn: (): Promise<MyStatsPayload> => api.getMyStats({
        league_id: filters.league_id ?? null,
        days: filters.days ?? null,
      }),
      enabled: enabled && userId > 0,
      staleTime: STATS_STALE_TIME_MS,
    }),
} as const;
