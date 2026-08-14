import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LeagueQueryResponse } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { leagueKeys } from './keys';

interface HttpErrorShape {
  readonly message?: string;
  readonly response?: {
    readonly status?: number;
    readonly data?: { readonly detail?: unknown };
  };
}

interface FindLeagueSnapshot {
  readonly queryKey: readonly unknown[];
  readonly data: LeagueQueryResponse | undefined;
}

function getErrorDetail(error: unknown): string | null {
  const detail = (error as HttpErrorShape)?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return error instanceof Error ? error.message : null;
}

function isAlreadyMemberError(error: unknown): boolean {
  return /already a member/i.test(getErrorDetail(error) ?? '');
}

/** Product-level copy for a failed public-league join. */
export function getJoinLeagueErrorMessage(error: unknown): string {
  const status = (error as HttpErrorShape)?.response?.status;
  const detail = getErrorDetail(error) ?? '';

  if (status === 403) {
    return 'You do not have permission to join this league.';
  }
  if (
    status == null ||
    /network|offline|timeout|connection/i.test(detail)
  ) {
    return 'You appear to be offline. Check your connection and try again.';
  }
  if (/pending|request already exists/i.test(detail)) {
    return 'Your request is already pending. Open the league to view its status.';
  }
  return 'We could not join this league. Refresh the list and try again.';
}

export function useJoinLeagueMutation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  return useMutation({
    mutationKey: [...leagueKeys.root(userId), 'join'] as const,
    mutationFn: async (leagueId: number) => {
      try {
        return await api.joinLeague(leagueId);
      } catch (error) {
        // The server is authoritative. If a stale card still offered Join,
        // reconcile it as success instead of showing an error.
        if (isAlreadyMemberError(error)) {
          return { success: true, message: 'Already a member' };
        }
        throw error;
      }
    },
    onMutate: async (leagueId): Promise<FindLeagueSnapshot[]> => {
      await queryClient.cancelQueries({
        queryKey: leagueKeys.findRoot(userId),
      });
      const snapshots = queryClient
        .getQueriesData<LeagueQueryResponse>({
          queryKey: leagueKeys.findRoot(userId),
        })
        .map(([queryKey, data]) => ({ queryKey, data }));

      queryClient.setQueriesData<LeagueQueryResponse>(
        { queryKey: leagueKeys.findRoot(userId) },
        (old) =>
          old == null
            ? old
            : {
                ...old,
                items: old.items.map((league) =>
                  league.id === leagueId
                    ? { ...league, user_status: 'member' as const }
                    : league,
                ),
              },
      );
      return snapshots;
    },
    onError: (_error, leagueId, snapshots) => {
      for (const snapshot of snapshots ?? []) {
        const current = queryClient.getQueryData<LeagueQueryResponse>(
          snapshot.queryKey,
        );
        const stillOurOptimisticState = current?.items.some(
          (league) =>
            league.id === leagueId && league.user_status === 'member',
        );
        if (stillOurOptimisticState) {
          queryClient.setQueryData(snapshot.queryKey, snapshot.data);
        }
      }
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: leagueKeys.findRoot(userId),
        }),
        queryClient.invalidateQueries({
          queryKey: leagueKeys.userLeagues(userId),
        }),
      ]);
    },
  });
}
