import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import type { PushNotificationPrefs } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useNativePush } from '@/features/notifications/nativePushContext';
import { usePushPreferences } from '@/features/notifications';
import {
  NotificationMutationTimeoutError,
  withNotificationMutationDeadline,
} from '@/features/notifications/mutationDeadline';

export type PreferenceActionKey = keyof PushNotificationPrefs;

export interface PreferenceActionError {
  readonly key: PreferenceActionKey;
  readonly message: string;
  readonly retry: () => void;
}

const LABELS: Record<PreferenceActionKey, string> = {
  push_enabled: 'push notifications',
  direct_messages: 'chat messages',
  league_messages: 'league updates',
  friend_requests: 'friend requests',
  match_invites: 'game results',
  ranking_changes: 'ranking changes',
  tournament_updates: 'tournament updates',
};

export function useNotificationsScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { prefs, isLoading, error, refetch, updatePreferences } = usePushPreferences();
  const { authorization, enablePush, openSettings } = useNativePush();
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<PreferenceActionKey>>(
    () => new Set(),
  );
  const [actionErrors, setActionErrors] = useState<
    Partial<Record<PreferenceActionKey, PreferenceActionError>>
  >({});
  const pendingRef = useRef(new Set<PreferenceActionKey>());
  const generationsRef = useRef(new Map<PreferenceActionKey, number>());
  const userIdRef = useRef(userId);

  const retireAction = useCallback((key: PreferenceActionKey): void => {
    pendingRef.current.delete(key);
    setPendingKeys(new Set(pendingRef.current));
  }, []);

  const runAction = useCallback((
    key: PreferenceActionKey,
    desired: boolean,
    preferenceOnly = false,
  ): void => {
    if (pendingRef.current.has(key) || userId <= 0) return;
    const generation = (generationsRef.current.get(key) ?? 0) + 1;
    generationsRef.current.set(key, generation);
    pendingRef.current.add(key);
    setPendingKeys(new Set(pendingRef.current));
    setActionErrors((current) => ({ ...current, [key]: undefined }));

    const work = async (): Promise<void> => {
      let partialNativeSuccess = preferenceOnly;
      try {
        if (key !== 'push_enabled') {
          await updatePreferences({ [key]: desired });
        } else if (!desired) {
          await updatePreferences({ push_enabled: false });
        } else if (preferenceOnly) {
          await updatePreferences({ push_enabled: true });
        } else {
          const result = await withNotificationMutationDeadline(enablePush());
          if (result === 'preference_failed') {
            partialNativeSuccess = true;
            throw new Error('Preference save failed after native registration');
          }
          if (result !== 'enabled') throw new Error('Push registration failed');
        }

        if (
          userIdRef.current === userId &&
          generationsRef.current.get(key) === generation
        ) retireAction(key);
      } catch (caught) {
        if (
          userIdRef.current !== userId ||
          generationsRef.current.get(key) !== generation
        ) return;
        retireAction(key);
        const timedOut = caught instanceof NotificationMutationTimeoutError;
        const message = partialNativeSuccess
          ? 'Device notifications are enabled, but Beach League could not save your preference.'
          : timedOut
            ? `Beach League could not confirm the ${LABELS[key]} change in time.`
            : `Beach League could not save the ${LABELS[key]} change. Your previous setting was restored.`;
        const retry = () => runAction(key, desired, partialNativeSuccess);
        setActionErrors((current) => ({
          ...current,
          [key]: { key, message, retry },
        }));
        AccessibilityInfo.announceForAccessibility(`${message} Retry is available.`);
      }
    };

    void work();
  }, [enablePush, retireAction, updatePreferences, userId]);

  const onToggle = useCallback((key: PreferenceActionKey) => {
    if (prefs == null) return;
    runAction(key, !prefs[key]);
  }, [prefs, runAction]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    userIdRef.current = userId;
    pendingRef.current.clear();
    generationsRef.current.forEach((value, key) => {
      generationsRef.current.set(key, value + 1);
    });
    setPendingKeys(new Set());
    setActionErrors({});
  }, [userId]);

  useEffect(() => () => {
    generationsRef.current.forEach((value, key) => {
      generationsRef.current.set(key, value + 1);
    });
  }, []);

  return {
    prefs,
    authorization,
    isLoading,
    error: error instanceof Error ? error : error == null ? null : new Error(String(error)),
    pendingKeys,
    actionErrors,
    onToggle,
    onRetry,
    openSettings: () => { void openSettings(); },
  };
}

export type UseNotificationsScreenResult = ReturnType<typeof useNotificationsScreen>;
