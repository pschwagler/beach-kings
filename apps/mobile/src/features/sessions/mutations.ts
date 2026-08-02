import { mutationOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { sessionKeys } from './keys';

/** Shared session mutations keep API contracts out of rendering components. */
export const sessionMutationOptions = {
  invitePlayer: (userId: number, sessionId: number) =>
    mutationOptions({
      mutationKey: [
        ...sessionKeys.detail(userId, sessionId),
        'invite-player',
      ] as const,
      mutationFn: (playerId: number) =>
        api.inviteSessionPlayer(sessionId, playerId),
    }),
  removePlayer: (userId: number, sessionId: number) =>
    mutationOptions({
      mutationKey: [
        ...sessionKeys.detail(userId, sessionId),
        'remove-player',
      ] as const,
      mutationFn: (playerId: number) =>
        api.removeSessionPlayer(sessionId, playerId),
    }),
  updateCourt: (userId: number, sessionId: number) =>
    mutationOptions({
      mutationKey: [
        ...sessionKeys.detail(userId, sessionId),
        'update-court',
      ] as const,
      mutationFn: (courtId: number | null) =>
        api.updateSession(sessionId, { court_id: courtId }),
    }),
} as const;
