import { useCallback } from 'react';
import type { PushNotificationPrefs } from '@beach-kings/shared';
import { useNativePush } from '@/features/notifications/nativePushContext';
import { usePushPreferences } from '@/features/notifications';

export function useNotificationsScreen() {
  const {
    prefs,
    isLoading,
    error,
    isSaving,
    refetch,
    updatePreferences,
  } = usePushPreferences();
  const {
    authorization,
    enablePush,
    openSettings,
    isRegistering,
  } = useNativePush();

  const onToggle = useCallback(async (key: keyof PushNotificationPrefs) => {
    if (prefs == null) return;
    if (key === 'push_enabled') {
      if (authorization !== 'authorized' || !prefs.push_enabled) {
        await enablePush();
      } else {
        await updatePreferences({ push_enabled: false });
      }
      return;
    }
    await updatePreferences({ [key]: !prefs[key] });
  }, [authorization, enablePush, prefs, updatePreferences]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    prefs,
    authorization,
    isLoading,
    error: error instanceof Error ? error : error == null ? null : new Error(String(error)),
    isSaving: isSaving || isRegistering,
    onToggle: (key: keyof PushNotificationPrefs) => { void onToggle(key); },
    onRetry,
    openSettings: () => { void openSettings(); },
  };
}

export type UseNotificationsScreenResult = ReturnType<typeof useNotificationsScreen>;
