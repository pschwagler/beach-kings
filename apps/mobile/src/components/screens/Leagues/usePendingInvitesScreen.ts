/**
 * Data hook for the Pending Invites screen.
 *
 * Shows all league invites sent by the current user across all leagues.
 * Accessible from the leagues list via the "Pending Invites" action bar item.
 */

import { useQuery } from '@tanstack/react-query';
import { mockApi } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export interface UsePendingInvitesScreenResult {
  readonly invites: import('@/lib/mockApi').LeagueInviteItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * Returns data for the Pending Invites screen.
 */
export function usePendingInvitesScreen(): UsePendingInvitesScreenResult {
  const invitesQuery = useQuery({
    queryKey: leagueKeys.pendingInvites(),
    queryFn: () => mockApi.getPendingInvites(), // TODO(backend): GET /api/users/me/league-invites/sent
  });

  return {
    invites: invitesQuery.data ?? [],
    isLoading: invitesQuery.isLoading,
    isError: invitesQuery.isError,
  };
}
