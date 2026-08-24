import { useCallback, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeagueDetail, LeagueInviteItem } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { leagueKeys } from './keys';
import { orderReceivedLeagueInvites } from './invites';

type InviteAction = 'accept' | 'decline';

interface ResponseVariables {
  readonly leagueId: number;
  readonly action: InviteAction;
}

interface ResponseContext {
  readonly removedInvite: LeagueInviteItem | null;
}

export interface LeagueInviteResponses {
  readonly respondingIds: ReadonlySet<number>;
  readonly onAccept: (leagueId: number) => Promise<void>;
  readonly onDecline: (leagueId: number) => Promise<void>;
}

export function useLeagueInviteResponses(
  userId: number,
): LeagueInviteResponses {
  const queryClient = useQueryClient();
  const respondingRef = useRef(new Set<number>());
  const [respondingIds, setRespondingIds] = useState<ReadonlySet<number>>(
    new Set(),
  );

  const setResponding = useCallback((leagueId: number, active: boolean) => {
    if (active) {
      respondingRef.current.add(leagueId);
    } else {
      respondingRef.current.delete(leagueId);
    }
    setRespondingIds(new Set(respondingRef.current));
  }, []);

  const responseMutation = useMutation<
    unknown,
    unknown,
    ResponseVariables,
    ResponseContext
  >({
    mutationFn: ({ leagueId, action }) =>
      action === 'accept'
        ? api.acceptLeagueInvite(leagueId)
        : api.declineLeagueInvite(leagueId),
    onMutate: async ({ leagueId }) => {
      const queryKey = leagueKeys.receivedInvites(userId);
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<LeagueInviteItem[]>(queryKey) ?? [];
      const removedIndex = previous.findIndex(
        (invite) => invite.league_id === leagueId,
      );
      const removedInvite =
        removedIndex >= 0 ? previous[removedIndex] ?? null : null;

      queryClient.setQueryData<LeagueInviteItem[]>(
        queryKey,
        previous.filter((invite) => invite.league_id !== leagueId),
      );
      return { removedInvite };
    },
    onSuccess: (_data, { action, leagueId }) => {
      // Mark stale without replacing the optimistic result with an older
      // response. The next normal observation confirms server state.
      void queryClient.invalidateQueries({
        queryKey: leagueKeys.receivedInvites(userId),
        refetchType: 'none',
      });
      if (action === 'accept') {
        queryClient.setQueryData<LeagueDetail>(
          leagueKeys.detail(userId, leagueId),
          (current) =>
            current == null
              ? current
              : {
                  ...current,
                  user_role: current.user_role ?? 'member',
                  has_pending_request: false,
                },
        );
        void queryClient.invalidateQueries({
          queryKey: leagueKeys.detail(userId, leagueId),
        });
        void queryClient.invalidateQueries({
          queryKey: leagueKeys.userLeagues(userId),
        });
        void queryClient.invalidateQueries({
          queryKey: leagueKeys.findRoot(userId),
        });
      }
    },
    onError: (error, { leagueId, action }, context) => {
      if (context?.removedInvite != null) {
        const removedInvite = context.removedInvite;
        queryClient.setQueryData<LeagueInviteItem[]>(
          leagueKeys.receivedInvites(userId),
          (current = []) => {
            if (current.some((invite) => invite.league_id === leagueId)) {
              return current;
            }
            return orderReceivedLeagueInvites([...current, removedInvite]);
          },
        );
      }
      console.error('[useReceivedInvitesScreen] invite respond failed', error);
      Alert.alert(
        'Error',
        action === 'accept'
          ? 'Could not accept the invite. Please try again.'
          : 'Could not decline the invite. Please try again.',
      );
    },
    onSettled: (_data, _error, { leagueId }) => {
      setResponding(leagueId, false);
    },
  });

  const respond = useCallback(
    async (leagueId: number, action: InviteAction): Promise<void> => {
      if (respondingRef.current.has(leagueId)) return;
      setResponding(leagueId, true);
      try {
        await responseMutation.mutateAsync({ leagueId, action });
      } catch {
        // The mutation's onError owns safe user feedback and cache rollback.
      }
    },
    [responseMutation, setResponding],
  );

  const onAccept = useCallback(
    (leagueId: number) => respond(leagueId, 'accept'),
    [respond],
  );
  const onDecline = useCallback(
    (leagueId: number) => respond(leagueId, 'decline'),
    [respond],
  );

  return { respondingIds, onAccept, onDecline };
}
