/**
 * Data hook for the Notification Settings screen.
 *
 * Loads push notification preferences from the API and provides
 * optimistic toggle handlers.
 */

import { useCallback } from 'react';
import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import type { PushNotificationPrefs } from '@/lib/mockApi';

export interface UseNotificationsScreenResult {
  readonly prefs: PushNotificationPrefs | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isSaving: boolean;
  readonly onToggle: (key: keyof PushNotificationPrefs) => void;
  readonly onRetry: () => void;
}

export function useNotificationsScreen(): UseNotificationsScreenResult {
  const { data: prefs, isLoading, error, refetch, mutate } = useApi<PushNotificationPrefs>(
    () => api.getPushNotificationPrefs(),
    [],
  );

  // We track saving via a lightweight approach — fire-and-forget with optimistic update
  const onToggle = useCallback(
    (key: keyof PushNotificationPrefs) => {
      if (prefs == null) return;

      const updated: PushNotificationPrefs = { ...prefs, [key]: !prefs[key] };

      // Optimistic update
      mutate(updated);

      // Fire-and-forget — errors silently revert via next load
      void api.updatePushNotificationPrefs({ [key]: !prefs[key] }).catch(() => {
        // Revert on error
        mutate(prefs);
      });
    },
    [prefs, mutate],
  );

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    prefs: prefs ?? null,
    isLoading,
    error,
    isSaving: false,
    onToggle,
    onRetry,
  };
}
