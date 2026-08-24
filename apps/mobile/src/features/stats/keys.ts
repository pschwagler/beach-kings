import { privateKeys } from '@/infrastructure/query/keys';

export interface MyStatsFilters {
  readonly league_id?: number | null;
  readonly days?: number | null;
}

export const statsKeys = {
  root: (userId: number) => [...privateKeys.user(userId), 'stats'] as const,
  my: (userId: number, filters: MyStatsFilters = {}) => [
    ...statsKeys.root(userId),
    'me',
    {
      league_id: filters.league_id ?? 'all',
      days: filters.days ?? 'all',
    },
  ] as const,
} as const;
