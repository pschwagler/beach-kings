/**
 * Data + state hook for the Session Roster (Manage Players) screen.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { getApiErrorMessage } from '@/lib/apiError';
import { hapticMedium } from '@/utils/haptics';
import type { SessionDetail, SessionPlayerEntry } from '@beach-kings/shared';

export interface UseSessionRosterScreenResult {
  readonly session: SessionDetail | null;
  readonly players: readonly SessionPlayerEntry[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRemoving: number | null;
  readonly removeError: string | null;
  readonly isAddPlayerOpen: boolean;
  readonly onRemovePlayer: (entryId: number) => Promise<void>;
  readonly onAddPlayer: () => void;
  readonly onCloseAddPlayer: () => void;
  readonly onPlayerAdded: () => void;
  readonly onClose: () => void;
}

/**
 * Returns roster data + actions for the session roster screen.
 * @param sessionId - numeric session id
 */
export function useSessionRosterScreen(
  sessionId: number,
): UseSessionRosterScreenResult {
  const router = useRouter();
  const [isRemoving, setIsRemoving] = useState<number | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);

  const { data: session, isLoading, error, refetch } = useApi<SessionDetail>(
    () => api.getSessionById(sessionId),
    [sessionId],
  );

  const onRemovePlayer = useCallback(
    async (entryId: number) => {
      setRemoveError(null);
      setIsRemoving(entryId);
      await hapticMedium();
      try {
        await api.removeSessionPlayer(sessionId, entryId);
        void refetch();
      } catch (err) {
        setRemoveError(
          getApiErrorMessage(err, 'Could not remove player. Please try again.'),
        );
      } finally {
        setIsRemoving(null);
      }
    },
    [sessionId, refetch],
  );

  const onAddPlayer = useCallback(() => {
    setIsAddPlayerOpen(true);
  }, []);

  const onCloseAddPlayer = useCallback(() => {
    setIsAddPlayerOpen(false);
  }, []);

  const onPlayerAdded = useCallback(() => {
    setIsAddPlayerOpen(false);
    void refetch();
  }, [refetch]);

  const onClose = useCallback(() => {
    router.back();
  }, [router]);

  const players: readonly SessionPlayerEntry[] = (session?.players ?? []).map(p => {
    // Backend returns `player_id` populated for both real and placeholder players.
    // `p.id` is the same value (Player primary key); we fall back defensively in case
    // the shape ever drifts. The DELETE endpoint requires the player_id, never `0`.
    const playerId = p.player_id ?? p.entry_id;
    return {
      entry_id: playerId,
      player_id: playerId,
      display_name: p.display_name,
      initials: p.initials,
      avatar_url: p.avatar_url ?? null,
      game_count: p.game_count,
      is_placeholder: p.is_placeholder,
    };
  });

  return {
    session: session ?? null,
    players,
    isLoading,
    error,
    isRemoving,
    removeError,
    isAddPlayerOpen,
    onRemovePlayer,
    onAddPlayer,
    onCloseAddPlayer,
    onPlayerAdded,
    onClose,
  };
}
