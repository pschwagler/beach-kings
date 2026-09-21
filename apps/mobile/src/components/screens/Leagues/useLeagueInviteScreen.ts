/**
 * Data hook for the League Invite screen.
 *
 * Fetches invitable players (friends, recent opponents, suggested),
 * manages search text and selected player IDs, and applies consent-aware adds.
 */

import { useState, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { InvitablePlayer } from '@beach-kings/shared';
import { leagueKeys } from './leagueKeys';
import { useAuth } from '@/contexts/AuthContext';
import { leagueQueries } from '@/features/leagues/queries';
import { shareLeagueInvitation } from '@/features/leagues/share';

export interface UseLeagueInviteScreenResult {
  readonly players: InvitablePlayer[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly searchQuery: string;
  readonly selectedIds: ReadonlySet<number>;
  readonly isSending: boolean;
  readonly isSharing: boolean;
  readonly inviteError: string | null;
  readonly onChangeSearch: (q: string) => void;
  readonly onTogglePlayer: (id: number) => void;
  readonly onSendInvites: () => Promise<void>;
  readonly onShareLink: () => Promise<void>;
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
  const [isSharing, setIsSharing] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const shareInFlightRef = useRef(false);

  const playersQuery = useQuery({
    queryKey: leagueKeys.invitablePlayers(userId, leagueId, searchQuery),
    queryFn: () =>
      api.getInvitablePlayers(Number(leagueId), searchQuery || undefined),
    enabled: userId > 0,
  });
  const detailQuery = useQuery(leagueQueries.detail(userId, leagueId));

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
        // An immediate add changes the league roster, member counts, detail,
        // and the eligible-player results. Invalidate the user-scoped league
        // domain so every already-cached surface refetches authoritative data.
        queryKey: leagueKeys.root(userId),
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
  }, [leagueId, selectedIds, queryClient, userId]);

  const onClearInviteError = useCallback(() => {
    setInviteError(null);
  }, []);

  const onShareLink = useCallback(async (): Promise<void> => {
    if (shareInFlightRef.current) return;
    shareInFlightRef.current = true;
    setIsSharing(true);
    setInviteError(null);
    try {
      const league = detailQuery.data ?? (await detailQuery.refetch()).data;
      await shareLeagueInvitation(leagueId, league?.name ?? '');
    } catch {
      setInviteError('Could not share this league. Please try again.');
    } finally {
      shareInFlightRef.current = false;
      setIsSharing(false);
    }
  }, [detailQuery.data, detailQuery.refetch, leagueId]);

  return {
    players: playersQuery.data ?? [],
    isLoading: playersQuery.isLoading,
    isError: playersQuery.isError,
    searchQuery,
    selectedIds,
    isSending,
    isSharing,
    inviteError,
    onChangeSearch,
    onTogglePlayer,
    onSendInvites,
    onShareLink,
    onClearInviteError,
  };
}
