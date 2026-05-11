/**
 * Data hook for the Pending Invites screen.
 *
 * Shows all league invites sent by the current user across all leagues.
 * Accessible from the leagues list via the "Pending Invites" action bar item.
 */

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LeagueInviteItem } from '@beach-kings/shared';
import { leagueKeys } from './leagueKeys';

export interface UsePendingInvitesScreenResult {
  readonly invites: LeagueInviteItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * Returns data for the Pending Invites screen.
 */
export function usePendingInvitesScreen(): UsePendingInvitesScreenResult {
  const invitesQuery = useQuery({
    queryKey: leagueKeys.pendingInvites(),
    queryFn: () => api.getMySentLeagueInvites(),
  });

  return {
    invites: invitesQuery.data ?? [],
    isLoading: invitesQuery.isLoading,
    isError: invitesQuery.isError,
  };
}
