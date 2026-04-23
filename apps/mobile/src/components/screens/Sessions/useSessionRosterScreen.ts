/**
 * Data + state hook for the Session Roster (Manage Players) screen.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import type { SessionPlayer, SessionDetail } from '@/lib/mockApi';

export interface UseSessionRosterScreenResult {
  readonly session: SessionDetail | null;
  readonly players: readonly SessionPlayer[];
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRemoving: number | null;
  readonly removeError: string | null;
  readonly onRemovePlayer: (entryId: number) => Promise<void>;
  readonly onAddPlayer: () => void;
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
        const message =
          err instanceof Error ? err.message : 'Could not remove player.';
        setRemoveError(message);
      } finally {
        setIsRemoving(null);
      }
    },
    [sessionId, refetch],
  );

  const onAddPlayer = useCallback(() => {
    // TODO(backend): open player search sheet
  }, []);

  const onClose = useCallback(() => {
    router.back();
  }, [router]);

  return {
    session: session ?? null,
    players: session?.players ?? [],
    isLoading,
    error,
    isRemoving,
    removeError,
    onRemovePlayer,
    onAddPlayer,
    onClose,
  };
}
