import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { NativePushData, PushPlatform } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { api } from '@/lib/api';
import { notificationKeys } from './keys';
import { moderationKeys } from '@/features/moderation';
import { openNotification } from './openNotification';
import { claimNotificationPresentation } from './dedupe';
import { useNotifications } from './useNotifications';
import { usePushPreferences } from './usePushPreferences';
import {
  getPushInstallationState,
  getSoftAskChoice,
  retryPendingPushUnregister,
  savePushRegistration,
  setSoftAskChoice,
} from './pushInstallationStore';
import {
  NativePushContext,
  type NativePushAuthorization,
  type NativePushContextValue,
  type EnablePushResult,
} from './nativePushContext';


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

function projectId(): string | null {
  return Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas?.projectId as string | undefined) ??
    null;
}

function authorizationFrom(
  permissions: Notifications.NotificationPermissionsStatus,
): NativePushAuthorization {
  if (permissions.granted) return 'authorized';
  return permissions.status === 'denied' ? 'denied' : 'not_determined';
}

function parsePushData(value: unknown): NativePushData | null {
  if (value == null || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const notificationId = typeof raw.notificationId === 'number'
    ? raw.notificationId
    : Number(raw.notificationId);
  if (!Number.isSafeInteger(notificationId) || notificationId <= 0) return null;
  if (typeof raw.type !== 'string') return null;
  if (raw.linkUrl != null && typeof raw.linkUrl !== 'string') return null;
  const data = raw.data != null && typeof raw.data === 'object'
    ? raw.data as Record<string, string | number>
    : {};
  return {
    notificationId,
    type: raw.type as NativePushData['type'],
    linkUrl: raw.linkUrl as string | null,
    data,
  };
}

interface NativePushAccountGeneration {
  readonly generation: number;
  readonly userId: number;
  readonly isAuthenticated: boolean;
  readonly accountRestricted: boolean;
}

export default function NativePushProvider({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactNode {
  const { isAuthenticated, profileComplete, user, refreshUser } = useAuth();
  const userId = user?.id ?? 0;
  const accountRestricted = user?.moderation_status === 'suspended' ||
    user?.moderation_status === 'banned';
  const router = useRouter();
  const segments = useSegments() as string[];
  const rootNavigationState = useRootNavigationState();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { unreadCount, markAsRead, refetch } = useNotifications();
  const { updatePreferences } = usePushPreferences();
  const [authorization, setAuthorization] = useState<NativePushAuthorization>(
    Device.isDevice ? 'not_determined' : 'unavailable',
  );
  const [isRegistering, setIsRegistering] = useState(false);
  const accountGenerationRef = useRef<NativePushAccountGeneration>({
    generation: 0,
    userId,
    isAuthenticated,
    accountRestricted,
  });
  const renderedAccount = accountGenerationRef.current;
  if (
    renderedAccount.userId !== userId ||
    renderedAccount.isAuthenticated !== isAuthenticated ||
    renderedAccount.accountRestricted !== accountRestricted
  ) {
    accountGenerationRef.current = {
      generation: renderedAccount.generation + 1,
      userId,
      isAuthenticated,
      accountRestricted,
    };
  }
  const registrationRef = useRef<{
    readonly generation: number;
    readonly promise: Promise<boolean>;
  } | null>(null);
  const pendingResponseRef = useRef<Notifications.NotificationResponse | null>(null);
  const coldStartHandledUserRef = useRef<number | null>(null);
  const handledResponseIdsRef = useRef(new Set<string>());

  const isCurrentAccount = useCallback((expected: NativePushAccountGeneration): boolean => {
    const current = accountGenerationRef.current;
    return current.generation === expected.generation &&
      current.userId === expected.userId &&
      current.isAuthenticated === expected.isAuthenticated &&
      current.accountRestricted === expected.accountRestricted;
  }, []);

  const refreshAuthorization = useCallback(async (): Promise<NativePushAuthorization> => {
    const generation = accountGenerationRef.current.generation;
    if (!Device.isDevice) {
      if (accountGenerationRef.current.generation === generation) {
        setAuthorization('unavailable');
      }
      return 'unavailable';
    }
    try {
      const next = authorizationFrom(await Notifications.getPermissionsAsync());
      if (accountGenerationRef.current.generation === generation) setAuthorization(next);
      return next;
    } catch {
      if (accountGenerationRef.current.generation === generation) {
        setAuthorization('unavailable');
      }
      return 'unavailable';
    }
  }, []);

  const register = useCallback(async (
    requestPermission: boolean,
    expectedAccount = accountGenerationRef.current,
  ): Promise<boolean> => {
    if (
      !isCurrentAccount(expectedAccount) ||
      !expectedAccount.isAuthenticated ||
      expectedAccount.accountRestricted ||
      expectedAccount.userId === 0 ||
      !Device.isDevice
    ) {
      if (isCurrentAccount(expectedAccount)) setAuthorization('unavailable');
      return false;
    }
    if (registrationRef.current?.generation === expectedAccount.generation) {
      return registrationRef.current.promise;
    }
    const previousRegistration = registrationRef.current?.promise;
    let work!: Promise<boolean>;
    work = (async () => {
      setIsRegistering(true);
      try {
        if (previousRegistration != null) {
          await previousRegistration.catch(() => false);
          if (!isCurrentAccount(expectedAccount)) return false;
        }
        let permissions = await Notifications.getPermissionsAsync();
        if (!isCurrentAccount(expectedAccount)) return false;
        if (!permissions.granted && requestPermission && permissions.status !== 'denied') {
          permissions = await Notifications.requestPermissionsAsync({
            ios: { allowAlert: true, allowBadge: true, allowSound: true },
          });
          if (!isCurrentAccount(expectedAccount)) return false;
        }
        const nextAuthorization = authorizationFrom(permissions);
        setAuthorization(nextAuthorization);
        if (nextAuthorization !== 'authorized') return false;

        const easProjectId = projectId();
        if (easProjectId == null) {
          showToast('Notifications are not configured for this build.', 'error');
          return false;
        }
        if (Platform.OS === 'android') {
          if (!isCurrentAccount(expectedAccount)) return false;
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.MAX,
            sound: 'default',
          });
          if (!isCurrentAccount(expectedAccount)) return false;
        }

        if (!isCurrentAccount(expectedAccount)) return false;
        await retryPendingPushUnregister();
        if (!isCurrentAccount(expectedAccount)) return false;
        const installation = await getPushInstallationState();
        if (!isCurrentAccount(expectedAccount)) return false;
        const expoToken = (await Notifications.getExpoPushTokenAsync({
          projectId: easProjectId,
        })).data;
        if (!isCurrentAccount(expectedAccount)) return false;
        const platform = Platform.OS as PushPlatform;
        const response = await api.registerPushToken({
          token: expoToken,
          platform,
          installation_id: installation.installationId,
        });
        if (!isCurrentAccount(expectedAccount)) return false;
        if (response.unregister_secret == null) {
          throw new Error('Push registration did not return an unregister credential');
        }
        await savePushRegistration({
          token: expoToken,
          platform,
          projectId: easProjectId,
          userId: expectedAccount.userId,
          unregisterSecret: response.unregister_secret,
        });
        return isCurrentAccount(expectedAccount);
      } catch {
        if (isCurrentAccount(expectedAccount)) {
          showToast('Notifications could not be registered. We will retry.', 'error');
        }
        return false;
      } finally {
        if (registrationRef.current?.promise === work) {
          registrationRef.current = null;
          if (isCurrentAccount(expectedAccount)) setIsRegistering(false);
        }
      }
    })();
    registrationRef.current = { generation: expectedAccount.generation, promise: work };
    return work;
  }, [isCurrentAccount, showToast]);

  const enablePush = useCallback(async (): Promise<EnablePushResult> => {
    const expectedAccount = accountGenerationRef.current;
    const current = await refreshAuthorization();
    if (!isCurrentAccount(expectedAccount)) return 'not_enabled';
    if (current === 'denied') return 'not_enabled';
    const registered = await register(current === 'not_determined', expectedAccount);
    if (!isCurrentAccount(expectedAccount)) return 'not_enabled';
    if (registered) {
      try {
        await updatePreferences({ push_enabled: true });
        if (!isCurrentAccount(expectedAccount)) return 'not_enabled';
      } catch {
        if (!isCurrentAccount(expectedAccount)) return 'not_enabled';
        return 'preference_failed';
      }
    }
    return registered ? 'enabled' : 'not_enabled';
  }, [isCurrentAccount, refreshAuthorization, register, updatePreferences]);

  useEffect(() => {
    const currentGeneration = accountGenerationRef.current.generation;
    if (registrationRef.current?.generation !== currentGeneration) {
      setIsRegistering(false);
    }
  }, [accountRestricted, isAuthenticated, userId]);

  const openSettings = useCallback(() => Linking.openSettings(), []);

  const handleResponse = useCallback((response: Notifications.NotificationResponse) => {
    if (!isAuthenticated || userId === 0 || rootNavigationState?.key == null) {
      pendingResponseRef.current = response;
      return;
    }
    const data = parsePushData(response.notification.request.content.data);
    if (data == null) return;
    const responseId = response.notification.request.identifier ||
      `notification:${data.notificationId}`;
    if (handledResponseIdsRef.current.has(responseId)) return;
    if (handledResponseIdsRef.current.size >= 100) {
      handledResponseIdsRef.current.clear();
    }
    handledResponseIdsRef.current.add(responseId);
    const content = response.notification.request.content;
    openNotification({ id: data.notificationId, type: data.type, link_url: data.linkUrl,
      title: content.title ?? 'Beach League', message: content.body ?? 'You have a new notification' },
    (route) => router.push(route as never), markAsRead);
  }, [isAuthenticated, markAsRead, rootNavigationState?.key, router, userId]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener((notification) => {
      const data = parsePushData(notification.request.content.data);
      if (data == null || userId === 0) return;
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all(userId) });
      if (data.type === 'moderation_update') {
        void queryClient.invalidateQueries({
          queryKey: moderationKeys.accountStatus(userId),
        });
        void refreshUser().catch(() => {});
      }
      void refetch();
      if (
        AppState.currentState === 'active' &&
        claimNotificationPresentation(data.notificationId)
      ) {
        const title = notification.request.content.title ?? 'Beach League';
        const body = notification.request.content.body ?? 'You have a new notification';
        showToast(`${title}\n${body}`, 'info', () => {
          openNotification({ id: data.notificationId, type: data.type, link_url: data.linkUrl,
            title, message: body }, (route) => router.push(route as never), markAsRead);
        });
      }
    });
    const responded = Notifications.addNotificationResponseReceivedListener(handleResponse);
    const tokenChanged = Notifications.addPushTokenListener(() => {
      void register(false);
    });
    return () => {
      received.remove();
      responded.remove();
      tokenChanged.remove();
    };
  }, [handleResponse, markAsRead, queryClient, refetch, refreshUser, register, router, showToast, userId]);

  useEffect(() => {
    if (!isAuthenticated || userId === 0 || rootNavigationState?.key == null) return;
    if (pendingResponseRef.current != null) {
      const pending = pendingResponseRef.current;
      pendingResponseRef.current = null;
      handleResponse(pending);
    }
    if (coldStartHandledUserRef.current === userId) return;
    coldStartHandledUserRef.current = userId;
    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response != null) handleResponse(response);
        return Notifications.clearLastNotificationResponseAsync();
      })
      .catch(() => {});
  }, [handleResponse, isAuthenticated, rootNavigationState?.key, userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void refreshAuthorization().then((current) => {
        if (current === 'authorized' && isAuthenticated && !accountRestricted && userId > 0) {
          void register(false);
        }
      });
      if (isAuthenticated && userId > 0) void refetch();
    });
    return () => subscription.remove();
  }, [accountRestricted, isAuthenticated, refetch, refreshAuthorization, register, userId]);

  useEffect(() => {
    if (!isAuthenticated || userId === 0) {
      coldStartHandledUserRef.current = null;
      handledResponseIdsRef.current.clear();
      void Notifications.setBadgeCountAsync(0).catch(() => {});
      return;
    }
    void Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
  }, [isAuthenticated, unreadCount, userId]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !profileComplete ||
      userId === 0 ||
      segments[0] === '(auth)' ||
      segments[0] === '(account)' ||
      rootNavigationState?.key == null ||
      !Device.isDevice
    ) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        const existingChoice = await getSoftAskChoice(userId);
        if (cancelled || existingChoice != null) return;
        const current = await refreshAuthorization();
        if (cancelled) return;
        if (current === 'authorized') {
          await setSoftAskChoice(userId, 'allowed');
          await register(false);
          return;
        }
        if (current !== 'not_determined') return;
        Alert.alert(
          'Stay in the game',
          'Get alerts for messages, league updates, friend requests, and game results.',
          [
            {
              text: 'Not Now',
              style: 'cancel',
              onPress: () => {
                void setSoftAskChoice(userId, 'not_now');
                void updatePreferences({ push_enabled: false });
              },
            },
            {
              text: 'Allow Notifications',
              onPress: () => {
                void setSoftAskChoice(userId, 'allowed');
                void enablePush();
              },
            },
          ],
        );
      })();
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    enablePush,
    accountRestricted,
    isAuthenticated,
    profileComplete,
    refreshAuthorization,
    register,
    rootNavigationState?.key,
    segments,
    updatePreferences,
    userId,
  ]);

  useEffect(() => {
    void refreshAuthorization().then((current) => {
      if (current === 'authorized' && isAuthenticated && !accountRestricted && userId > 0) {
        void register(false);
      }
    });
  }, [accountRestricted, isAuthenticated, refreshAuthorization, register, userId]);

  const value = useMemo<NativePushContextValue>(() => ({
    authorization,
    enablePush,
    openSettings,
    isRegistering,
  }), [authorization, enablePush, isRegistering, openSettings]);

  return (
    <NativePushContext.Provider value={value}>
      {children}
    </NativePushContext.Provider>
  );
}
