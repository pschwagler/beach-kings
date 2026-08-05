import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { apiWebSocketUrl } from '@/config/apiOrigin';
import { useAuth } from '@/contexts/AuthContext';
import { socialKeys } from '@/features/social/keys';
import { playerKeys } from '@/features/player';
import { reconcileGameMutation } from '@/features/matches';
import {
  getSocketDirectMessage,
  reconcileDirectMessageEvent,
} from '@/features/messages';
import useWebSocket from '@/hooks/useWebSocket';
import { api } from '@/lib/api';
import { getSocketNotification, reconcileNotificationEvent } from './cache';

/** WebSocket lifecycle and cache reconciliation for notification events. */
export default function NotificationTransport(): null {
  const { isAuthenticated, user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const [transportEnabled, setTransportEnabled] = useState(false);

  const handleMessage = useCallback((data: unknown) => {
    if (userId === 0) return;
    const directMessage = getSocketDirectMessage(data);
    if (directMessage != null) {
      reconcileDirectMessageEvent(queryClient, userId, directMessage);
      return;
    }
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
    if (
      notification.type === 'session_submitted' ||
      notification.type === 'session_auto_submitted' ||
      notification.type === 'session_auto_deleted'
    ) {
      const rawLeagueId = notification.data?.league_id;
      const leagueId = typeof rawLeagueId === 'number' ? rawLeagueId : null;
      void reconcileGameMutation(queryClient, { userId, leagueId });
      // These notifications do not currently carry stats job IDs. Mark the
      // player stale without racing the worker; foreground/focus will fetch it.
      void queryClient.invalidateQueries({
        queryKey: playerKeys.me(userId),
        refetchType: 'none',
      });
    }
  }, [queryClient, userId]);

  useEffect(() => {
    setTransportEnabled(isAuthenticated && userId > 0);
  }, [isAuthenticated, userId]);

  const { isConnected, send } = useWebSocket({
    url: apiWebSocketUrl('/api/ws/notifications'),
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
