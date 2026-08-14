import { mutationOptions } from '@tanstack/react-query';
import type { GameCreatePayload, Match } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { matchKeys } from './keys';

/** Canonical game-write contracts shared by score-entry consumers. */
export const matchMutationOptions = {
  create: (userId: number) =>
    mutationOptions({
      mutationKey: [...matchKeys.all(userId), 'create'] as const,
      mutationFn: (payload: GameCreatePayload) => api.submitScoredGame(payload),
    }),
  update: (userId: number, matchId: number) =>
    mutationOptions({
      mutationKey: [...matchKeys.all(userId), 'update', matchId] as const,
      mutationFn: (payload: Partial<Match>) =>
        api.updateMatch(matchId, payload),
    }),
  remove: (userId: number, matchId: number) =>
    mutationOptions({
      mutationKey: [...matchKeys.all(userId), 'remove', matchId] as const,
      mutationFn: () => api.deleteMatch(matchId),
    }),
} as const;
