import { queryOptions } from '@tanstack/react-query';
import type { Player } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { playerKeys } from './keys';

const PLAYER_STALE_TIME_MS = 30_000;

export const playerQueries = {
  me: (userId: number, enabled = true) => queryOptions({
    queryKey: playerKeys.me(userId),
    queryFn: async (): Promise<Player | null> =>
      (await api.getCurrentUserPlayer()) ?? null,
    enabled: enabled && userId > 0,
    staleTime: PLAYER_STALE_TIME_MS,
    // Player identity and stats are small, critical, and can change while the
    // app is backgrounded (for example after session auto-submission).
    refetchOnWindowFocus: 'always' as const,
  }),
};
