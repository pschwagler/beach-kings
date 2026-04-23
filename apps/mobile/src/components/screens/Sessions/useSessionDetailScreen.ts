/**
 * Data hook for the Session Detail (active + submitted) screen.
 *
 * Fetches session detail by id, exposes menu state, and submit session handler.
 */

import { useState, useCallback } from 'react';
import { useRouter } from 'expo-router';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import type { SessionDetail } from '@/lib/mockApi';

export interface UseSessionDetailScreenResult {
  readonly session: SessionDetail | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly isMenuOpen: boolean;
  readonly isSubmitting: boolean;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  readonly onAddGame: () => void;
  readonly onSubmitSession: () => Promise<void>;
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

  const { data, isLoading, error, refetch } = useApi<SessionDetail>(
    () => api.getSessionById(sessionId),
    [sessionId],
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
    await hapticMedium();
    try {
      await api.lockInSession(sessionId);
      void refetch();
    } catch {
      // TODO(backend): handle submit error
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, refetch]);

  return {
    session: data ?? null,
    isLoading,
    error,
    isRefreshing,
    isMenuOpen,
    isSubmitting,
    onRefresh,
    onRetry,
    openMenu,
    closeMenu,
    onAddGame,
    onSubmitSession,
  };
}
