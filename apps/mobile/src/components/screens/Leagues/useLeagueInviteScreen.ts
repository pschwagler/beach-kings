/**
 * Data hook for the League Invite screen.
 *
 * Fetches invitable players (friends, recent opponents, suggested),
 * manages search text and selected player IDs, and applies consent-aware adds.
 */

import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { InvitablePlayer } from '@beach-kings/shared';
import { leagueKeys } from './leagueKeys';
import { useAuth } from '@/contexts/AuthContext';

export interface UseLeagueInviteScreenResult {
  readonly players: InvitablePlayer[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly searchQuery: string;
  readonly selectedIds: ReadonlySet<number>;
  readonly isSending: boolean;
  readonly inviteError: string | null;
  readonly onChangeSearch: (q: string) => void;
  readonly onTogglePlayer: (id: number) => void;
  readonly onSendInvites: () => Promise<void>;
  readonly onClearInviteError: () => void;
}

/**
 * Returns data and state for the League Invite screen.
 */
export function useLeagueInviteScreen(
  leagueId: number | string,
): UseLeagueInviteScreenResult {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(new Set());
  const [isSending, setIsSending] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const playersQuery = useQuery({
    queryKey: leagueKeys.invitablePlayers(userId, leagueId, searchQuery),
    queryFn: () =>
      api.getInvitablePlayers(Number(leagueId), searchQuery || undefined),
    enabled: userId > 0,
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
    setInviteError(null);
    try {
      await api.addLeagueMembersBatch(Number(leagueId), [...selectedIds]);
      await queryClient.invalidateQueries({
        queryKey: leagueKeys.invitablePlayers(userId, leagueId, searchQuery),
      });
      setSelectedIds(new Set());
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not add players. Please try again.';
      setInviteError(message);
    } finally {
      setIsSending(false);
    }
  }, [leagueId, selectedIds, searchQuery, queryClient, userId]);

  const onClearInviteError = useCallback(() => {
    setInviteError(null);
  }, []);

  return {
    players: playersQuery.data ?? [],
    isLoading: playersQuery.isLoading,
    isError: playersQuery.isError,
    searchQuery,
    selectedIds,
    isSending,
    inviteError,
    onChangeSearch,
    onTogglePlayer,
    onSendInvites,
    onClearInviteError,
  };
}
