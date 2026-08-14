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
import { useAuth } from '@/contexts/AuthContext';

export interface UsePendingInvitesScreenResult {
  readonly invites: LeagueInviteItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
}

/**
 * Returns data for the Pending Invites screen.
 */
export function usePendingInvitesScreen(): UsePendingInvitesScreenResult {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const invitesQuery = useQuery({
    queryKey: leagueKeys.pendingInvites(userId),
    queryFn: () => api.getMySentLeagueInvites(),
    enabled: userId > 0,
  });

  return {
    invites: invitesQuery.data ?? [],
    isLoading: invitesQuery.isLoading,
    isError: invitesQuery.isError,
  };
}
