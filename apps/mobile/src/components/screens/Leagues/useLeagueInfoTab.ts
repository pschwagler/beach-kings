/**
 * Data hook for the League Info tab.
 *
 * Fetches info detail; exposes admin actions (approve/deny join requests,
 * leave league).
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mockApi } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export interface UseLeagueInfoTabResult {
  readonly info: import('@/lib/mockApi').LeagueInfoDetail | null;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onApproveRequest: (requestId: number) => Promise<void>;
  readonly onDenyRequest: (requestId: number) => Promise<void>;
  readonly onLeaveLeague: () => Promise<void>;
}

/**
 * Returns all data and handlers for the League Info tab.
 */
export function useLeagueInfoTab(
  leagueId: number | string,
): UseLeagueInfoTabResult {
  const queryClient = useQueryClient();

  const infoQuery = useQuery({
    queryKey: leagueKeys.info(leagueId),
    queryFn: () => mockApi.getLeagueInfoDetail(leagueId), // TODO(backend): GET /api/leagues/:id/info
  });

  const invalidateInfo = useCallback((): Promise<void> => {
    return queryClient.invalidateQueries({ queryKey: leagueKeys.info(leagueId) });
  }, [queryClient, leagueId]);

  const onApproveRequest = useCallback(
    async (requestId: number): Promise<void> => {
      await mockApi.approveJoinRequest(leagueId, requestId); // TODO(backend): POST /api/leagues/:id/join-requests/:requestId/approve
      await invalidateInfo();
    },
    [leagueId, invalidateInfo],
  );

  const onDenyRequest = useCallback(
    async (requestId: number): Promise<void> => {
      await mockApi.denyJoinRequest(leagueId, requestId); // TODO(backend): POST /api/leagues/:id/join-requests/:requestId/deny
      await invalidateInfo();
    },
    [leagueId, invalidateInfo],
  );

  const onLeaveLeague = useCallback(async (): Promise<void> => {
    await mockApi.leaveLeagueMock(leagueId); // TODO(backend): DELETE /api/leagues/:id/members/me
    await invalidateInfo();
  }, [leagueId, invalidateInfo]);

  return {
    info: infoQuery.data ?? null,
    isLoading: infoQuery.isLoading,
    isError: infoQuery.isError,
    onApproveRequest,
    onDenyRequest,
    onLeaveLeague,
  };
}
