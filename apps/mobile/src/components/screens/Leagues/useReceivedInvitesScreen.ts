/**
 * Data hook for the Received Invites screen.
 *
 * Shows all league invites received by the current user across all leagues.
 * Allows the user to accept or decline each invite.
 * Accessible from the leagues list via the "Invites Received" action bar row.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LeagueInviteItem } from '@beach-kings/shared';
import { leagueKeys } from './leagueKeys';
import { leaguesScreenKeys } from './useLeaguesScreen';

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
}

/**
 * Returns data and state for the Received Invites screen.
 */
export function useReceivedInvitesScreen(): UseReceivedInvitesScreenResult {
  const queryClient = useQueryClient();

  const invitesQuery = useQuery({
    queryKey: leagueKeys.receivedInvites(),
    queryFn: () => api.getReceivedLeagueInvites(),
  });

  /**
   * Optimistic overlay: league IDs that have been responded to are removed
   * from the list immediately; the query refetch will confirm the server state.
   */
  const [removedLeagueIds, setRemovedLeagueIds] = useState<ReadonlySet<number>>(new Set());

  /** League IDs whose respond request is in-flight. */
  const [respondingIds, setRespondingIds] = useState<ReadonlySet<number>>(new Set());

  const setResponding = useCallback((leagueId: number, active: boolean): void => {
    setRespondingIds((prev) => {
      const next = new Set(prev);
      if (active) {
        next.add(leagueId);
      } else {
        next.delete(leagueId);
      }
      return next;
    });
  }, []);

  const handleRespond = useCallback(
    async (leagueId: number, action: 'accept' | 'decline'): Promise<void> => {
      setResponding(leagueId, true);
      // Optimistically remove the row.
      setRemovedLeagueIds((prev) => new Set([...prev, leagueId]));
      try {
        if (action === 'accept') {
          await api.acceptLeagueInvite(leagueId);
          // Invalidate user leagues so a newly-joined league appears in the list.
          void queryClient.invalidateQueries({ queryKey: leaguesScreenKeys.leagues() });
          void queryClient.invalidateQueries({ queryKey: leagueKeys.userLeagues() });
        } else {
          await api.declineLeagueInvite(leagueId);
        }
        // Refresh received invites to sync server state.
        void queryClient.invalidateQueries({ queryKey: leagueKeys.receivedInvites() });
      } catch (err) {
        // Restore the row on error.
        setRemovedLeagueIds((prev) => {
          const next = new Set(prev);
          next.delete(leagueId);
          return next;
        });
        // Log the raw error for debugging but never surface it to the user —
        // backend error strings may contain sensitive information or be
        // untranslated/user-unfriendly.
        console.error('[useReceivedInvitesScreen] invite respond failed', err);
        const message =
          action === 'accept'
            ? 'Could not accept the invite. Please try again.'
            : 'Could not decline the invite. Please try again.';
        Alert.alert('Error', message);
      } finally {
        setResponding(leagueId, false);
      }
    },
    [queryClient, setResponding],
  );

  const onAccept = useCallback(
    (leagueId: number): Promise<void> => handleRespond(leagueId, 'accept'),
    [handleRespond],
  );

  const onDecline = useCallback(
    (leagueId: number): Promise<void> => handleRespond(leagueId, 'decline'),
    [handleRespond],
  );

  const rawInvites = invitesQuery.data ?? [];
  const invites = rawInvites.filter((inv) => !removedLeagueIds.has(inv.league_id));

  return {
    invites,
    isLoading: invitesQuery.isLoading,
    isError: invitesQuery.isError,
    respondingIds,
    onAccept,
    onDecline,
  };
}
