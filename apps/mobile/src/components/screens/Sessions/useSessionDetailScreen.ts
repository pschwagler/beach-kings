/**
 * Data hook for the Session Detail (active + submitted) screen.
 *
 * Fetches session detail by id, exposes menu state, and submit session handler.
 */

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { SessionDetail } from '@beach-kings/shared';

export interface UseSessionDetailScreenResult {
  readonly session: SessionDetail | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly isMenuOpen: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  /** Display name of the authenticated user, used to derive per-game team membership. */
  readonly currentPlayerName: string | null;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  readonly onAddGame: () => void;
  readonly onSubmitSession: () => Promise<void>;
  readonly onClearSubmitError: () => void;
}

/**
 * Returns session detail data + actions for the session detail screen.
 * @param sessionId - numeric session id from route params
 */
export function useSessionDetailScreen(
  sessionId: number,
): UseSessionDetailScreenResult {
  const router = useRouter();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [currentPlayerName, setCurrentPlayerName] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useApi<SessionDetail>(
    () => api.getSessionById(sessionId),
    [sessionId],
  );

  useEffect(() => {
    let cancelled = false;
    void api
      .getCurrentUserPlayer()
      .then((player) => {
        if (!cancelled && player != null) {
          setCurrentPlayerName(player.full_name ?? player.name ?? null);
        }
      })
      .catch(() => {
        // Non-fatal: per-game team highlight will fall back to "pending".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const openMenu = useCallback(() => {
    void hapticLight();
    setIsMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const onAddGame = useCallback(() => {
    void hapticMedium();
    router.push('/(tabs)/add-games');
  }, [router]);

  const onSubmitSession = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    await hapticMedium();
    try {
      await api.lockInSession(sessionId);
      void refetch();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Could not submit session. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, refetch]);

  const onClearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  return {
    session: data ?? null,
    isLoading,
    error,
    isRefreshing,
    isMenuOpen,
    isSubmitting,
    submitError,
    currentPlayerName,
    onRefresh,
    onRetry,
    openMenu,
    closeMenu,
    onAddGame,
    onSubmitSession,
    onClearSubmitError,
  };
}
