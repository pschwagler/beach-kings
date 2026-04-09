/**
 * Hook for managing push notifications.
 *
 * Acquires an Expo push token, registers it with the backend,
 * and sets up foreground notification listeners.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api } from '../services/api';

const PUSH_TOKEN_KEY = 'beach_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function useNotifications() {
  const [expoPushToken, setExpoPushToken] = useState<string>('');
  const [notification, setNotification] = useState<Notifications.Notification | null>(null);
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);
  const registeredTokenRef = useRef<string | null>(null);

  /**
   * Register the push token with the backend.
   * Only sends if we have a token and it hasn't already been registered.
   */
  const registerTokenWithBackend = useCallback(async (token: string) => {
    if (!token || registeredTokenRef.current === token) return;

    try {
      const axiosInstance = (api as any).axios;
      if (!axiosInstance) return;

      await axiosInstance.post('/api/push-tokens', {
        token,
        platform: Platform.OS, // "ios" or "android"
      });
      registeredTokenRef.current = token;
      await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
    } catch (error: any) {
      // 401 means user isn't authenticated yet — will retry after login
      if (error.response?.status !== 401) {
        console.error('[useNotifications] Failed to register push token:', error.message);
      }
    }
  }, []);

  /**
   * Unregister the push token from the backend.
   * Call this on logout so the device stops receiving push notifications.
   */
  const unregisterToken = useCallback(async () => {
    const token = registeredTokenRef.current || expoPushToken;
    if (!token) return;

    try {
      const axiosInstance = (api as any).axios;
      if (!axiosInstance) return;

      await axiosInstance.delete('/api/push-tokens', {
        data: { token, platform: Platform.OS },
      });
      registeredTokenRef.current = null;
    } catch (error: any) {
      console.error('[useNotifications] Failed to unregister push token:', error.message);
    }
  }, [expoPushToken]);

  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        setExpoPushToken(token);
        registerTokenWithBackend(token);
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(
      (notif: Notifications.Notification) => {
        setNotification(notif);
      }
    );

    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {});

    return () => {
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, [registerTokenWithBackend]);

  return {
    expoPushToken,
    notification,
    registerTokenWithBackend,
    unregisterToken,
  };
}

async function registerForPushNotificationsAsync(): Promise<string | undefined> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4a90a4',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    return undefined;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync();
  return tokenData.data;
}
