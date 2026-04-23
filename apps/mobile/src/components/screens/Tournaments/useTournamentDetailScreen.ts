/**
 * Data hook for the Tournament Detail screen.
 *
 * Fetches full tournament detail by id and exposes role-based action handlers.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import type { KobTournamentDetail } from '@beach-kings/shared';

export type TournamentRole =
  | 'visitor'
  | 'requested'
  | 'registered'
  | 'waitlist'
  | 'creator';

export interface UseTournamentDetailScreenResult {
  readonly tournament: KobTournamentDetail | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly role: TournamentRole;
  readonly isActioning: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly onRequestJoin: () => Promise<void>;
  readonly onInviteFriends: () => void;
}

/**
 * Returns tournament detail data + actions for the detail screen.
 * @param tournamentId - numeric tournament id
 */
export function useTournamentDetailScreen(
  tournamentId: number,
): UseTournamentDetailScreenResult {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [role, setRole] = useState<TournamentRole>('visitor');
  const [isActioning, setIsActioning] = useState(false);

  const { data, isLoading, error, refetch } = useApi<KobTournamentDetail>(
    () => api.getTournament(tournamentId),
    [tournamentId],
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const onRequestJoin = useCallback(async () => {
    setIsActioning(true);
    await hapticMedium();
    try {
      // TODO(backend): POST /api/tournaments/:id/join-request
      setRole('requested');
    } finally {
      setIsActioning(false);
    }
  }, []);

  const onInviteFriends = useCallback(() => {
    void hapticLight();
    // TODO(backend): navigate to tournament invite screen
  }, []);

  return {
    tournament: data ?? null,
    isLoading,
    error,
    isRefreshing,
    role,
    isActioning,
    onRefresh,
    onRetry,
    onRequestJoin,
    onInviteFriends,
  };
}
