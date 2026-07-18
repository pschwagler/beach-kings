import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { socialKeys } from '@/features/social/keys';
import useWebSocket from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { getSocketNotification, reconcileNotificationEvent } from './cache';

function buildWsUrl(): string {
  const baseUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
  return baseUrl.replace(/^http/, 'ws') + '/api/ws/notifications';
}

/** WebSocket lifecycle and cache reconciliation for notification events. */
export default function NotificationTransport(): null {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const [transportEnabled, setTransportEnabled] = useState(false);

  const handleMessage = useCallback((data: unknown) => {
    if (userId === 0) return;
    const message = getSocketNotification(data);
    if (message == null) return;
    const { eventType, notification } = message;
    if (
      eventType !== 'notification' &&
      eventType !== 'direct_message' &&
      eventType !== 'notification_updated'
    ) return;

    reconcileNotificationEvent(queryClient, userId, eventType, notification);
    if (eventType !== 'notification_updated') {
      void Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
    }
    if (
      notification.type === 'friend_request' ||
      notification.type === 'friend_accepted'
    ) {
      void queryClient.invalidateQueries({ queryKey: socialKeys.all(userId) });
    }
  }, [queryClient, userId]);

  useEffect(() => {
    setTransportEnabled(isAuthenticated && userId > 0);
  }, [isAuthenticated, userId]);

  const { isConnected, send } = useWebSocket({
    url: buildWsUrl(),
    enabled: transportEnabled,
    onMessage: handleMessage,
  });

  useEffect(() => {
    if (!isConnected || !isAuthenticated || userId === 0) return;
    let cancelled = false;
    void api.getStoredTokens()
      .then(({ accessToken }) => {
        if (!cancelled && accessToken != null) {
          send({ type: 'auth', token: accessToken });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isConnected, send, userId]);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isAuthenticated && userId > 0) {
        setTransportEnabled(false);
        reconnectTimer = setTimeout(() => setTransportEnabled(true), 0);
      }
    });
    return () => {
      subscription.remove();
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
    };
  }, [isAuthenticated, userId]);

  return null;
}
