/**
 * Data hook for the League Invite screen.
 *
 * Fetches invitable players (friends, recent opponents, suggested),
 * manages search text and selected player IDs, and sends invites.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mockApi } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export interface UseLeagueInviteScreenResult {
  readonly players: import('@/lib/mockApi').InvitablePlayer[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly searchQuery: string;
  readonly selectedIds: ReadonlySet<number>;
  readonly isSending: boolean;
  readonly onChangeSearch: (q: string) => void;
  readonly onTogglePlayer: (id: number) => void;
  readonly onSendInvites: () => Promise<void>;
}

/**
 * Returns data and state for the League Invite screen.
 */
export function useLeagueInviteScreen(
  leagueId: number | string,
): UseLeagueInviteScreenResult {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [isSending, setIsSending] = useState(false);

  const playersQuery = useQuery({
    queryKey: leagueKeys.invitablePlayers(leagueId, searchQuery),
    queryFn: () =>
      mockApi.getInvitablePlayers(leagueId, searchQuery || undefined), // TODO(backend): GET /api/leagues/:id/invitable-players?q=
  });

  const onChangeSearch = useCallback((q: string) => {
    setSearchQuery(q);
  }, []);

  const onTogglePlayer = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const onSendInvites = useCallback(async (): Promise<void> => {
    if (selectedIds.size === 0) return;
    setIsSending(true);
    try {
      await mockApi.sendLeagueInvites(leagueId, [...selectedIds]); // TODO(backend): POST /api/leagues/:id/invites
      await queryClient.invalidateQueries({
        queryKey: leagueKeys.invitablePlayers(leagueId, searchQuery),
      });
      setSelectedIds(new Set());
    } finally {
      setIsSending(false);
    }
  }, [leagueId, selectedIds, searchQuery, queryClient]);

  return {
    players: playersQuery.data ?? [],
    isLoading: playersQuery.isLoading,
    isError: playersQuery.isError,
    searchQuery,
    selectedIds,
    isSending,
    onChangeSearch,
    onTogglePlayer,
    onSendInvites,
  };
}
