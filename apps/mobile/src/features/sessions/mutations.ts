import { mutationOptions } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Shared session mutations keep API contracts out of rendering components. */
export const sessionMutationOptions = {
  invitePlayer: (sessionId: number) =>
    mutationOptions({
      mutationKey: ['session', sessionId, 'invite-player'] as const,
      mutationFn: (playerId: number) =>
        api.inviteSessionPlayer(sessionId, playerId),
    }),
  updateCourt: (sessionId: number) =>
    mutationOptions({
      mutationKey: ['session', sessionId, 'update-court'] as const,
      mutationFn: (courtId: number | null) =>
        api.updateSession(sessionId, { court_id: courtId }),
    }),
} as const;
