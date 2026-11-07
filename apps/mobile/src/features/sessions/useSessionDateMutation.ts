import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SessionDetail } from '@beach-kings/shared';
import { sessionKeys } from './keys';
import { sessionMutationOptions } from './mutations';
import { reconcileGameMutation } from '@/features/matches';
import { leagueKeys } from '@/features/leagues/keys';

/** A confirmed date-only write; never recreates a cleared account cache. */
export function useSessionDateMutation(userId: number, sessionId: number) {
  const client = useQueryClient();
  const owner = useRef({ userId, sessionId, active: true });
  if (owner.current.userId !== userId || owner.current.sessionId !== sessionId) {
    owner.current.active = false;
    owner.current = { userId, sessionId, active: true };
  }
  useEffect(() => {
    const scope = owner.current;
    scope.active = true;
    return () => { scope.active = false; };
  }, [userId, sessionId]);

  const key = sessionKeys.detail(userId, sessionId);
  return useMutation({
    ...sessionMutationOptions.updateDate(userId, sessionId),
    scope: { id: `session-date:${userId}:${sessionId}` },
    onMutate: () => ({
      owner: owner.current,
      query: client.getQueryCache().find({ queryKey: key, exact: true }),
      previous: client.getQueryData<SessionDetail>(key),
    }),
    onSuccess: (_response, date, context) => {
      if (!context?.owner.active || context.owner !== owner.current || !context.query
        || client.getQueryCache().find({ queryKey: key, exact: true }) !== context.query) return;
      client.setQueryData<SessionDetail>(key, (current) =>
        current != null && current.date === context.previous?.date
          ? { ...current, date }
          : current,
      );
      const leagueId = context.previous?.league_id;
      if (leagueId != null) {
        void client.invalidateQueries({ queryKey: leagueKeys.sessions(userId, leagueId) });
      }
      void reconcileGameMutation(client, { userId, leagueId });
    },
  });
}
