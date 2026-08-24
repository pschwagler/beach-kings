/**
 * Data hook for the Received Invites screen.
 *
 * Shows all league invites received by the current user across all leagues.
 * Allows the user to accept or decline each invite.
 * Accessible from the leagues list via the "Invites Received" action bar row.
 */

import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { LeagueInviteItem } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import {
  getPendingLeagueInvites,
  leagueQueries,
  useLeagueInviteResponses,
} from '@/features/leagues';

export interface UseReceivedInvitesScreenResult {
  /** Pending invites currently displayed (responded invites are removed optimistically). */
  readonly invites: LeagueInviteItem[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  /** IDs of leagues whose respond action is currently in-flight. */
  readonly respondingIds: ReadonlySet<number>;
  /** Accept an invite by league_id. */
  readonly onAccept: (leagueId: number) => Promise<void>;
  /** Decline an invite by league_id. */
  readonly onDecline: (leagueId: number) => Promise<void>;
  readonly onRetry: () => void;
}

/**
 * Returns data and state for the Received Invites screen.
 */
export function useReceivedInvitesScreen(): UseReceivedInvitesScreenResult {
  const { user } = useAuth();
  const userId = user?.id ?? 0;

  const invitesQuery = useQuery(leagueQueries.receivedInvites(userId));
  const { respondingIds, onAccept, onDecline } =
    useLeagueInviteResponses(userId);
  const onRetry = useCallback(() => {
    void invitesQuery.refetch();
  }, [invitesQuery]);

  return {
    invites: getPendingLeagueInvites(invitesQuery.data),
    isLoading: invitesQuery.isLoading,
    isError: invitesQuery.isError,
    respondingIds,
    onAccept,
    onDecline,
    onRetry,
  };
}
