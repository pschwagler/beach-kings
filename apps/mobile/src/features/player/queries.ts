import { queryOptions } from '@tanstack/react-query';
import type { Player, PlayerHomeCourt } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { playerKeys } from './keys';

const PLAYER_STALE_TIME_MS = 30_000;

export const playerQueries = {
  homeCourts: (
    userId: number,
    playerId: number,
    enabled = true,
  ) => queryOptions({
    queryKey: playerKeys.homeCourts(userId, playerId),
    queryFn: (): Promise<PlayerHomeCourt[]> => api.getPlayerHomeCourts(playerId),
    enabled: enabled && userId > 0 && playerId > 0,
    staleTime: PLAYER_STALE_TIME_MS,
  }),
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
