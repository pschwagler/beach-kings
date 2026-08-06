import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
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
import { privateKeys } from '@/infrastructure/query/keys';
import { useToast } from '@/contexts/ToastContext';
import { routes } from '@/lib/navigation';
import { moderationKeys } from '@/features/moderation';
import { getSocketNotification, reconcileNotificationEvent } from './cache';
import { claimNotificationPresentation } from './dedupe';
import { resolveNotificationRoute } from './navigation';
import { useNotifications } from './useNotifications';

/** WebSocket lifecycle and cache reconciliation for notification events. */
export default function NotificationTransport(): null {
  const { isAuthenticated, user, refreshUser } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const { markAsRead } = useNotifications();
  const [transportEnabled, setTransportEnabled] = useState(false);
  const moderationRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMessage = useCallback((data: unknown) => {
    if (userId === 0) return;
    if (
      data != null &&
      typeof data === 'object' &&
      (data as { readonly type?: unknown }).type === 'private_data_invalidated'
    ) {
      void queryClient.invalidateQueries({ queryKey: privateKeys.user(userId) });
      return;
    }
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
      eventType === 'notification' &&
      claimNotificationPresentation(notification.id)
    ) {
      showToast(`${notification.title}\n${notification.message}`, 'info', () => {
        markAsRead(notification.id);
        router.push((
          resolveNotificationRoute(notification.link_url) ??
          routes.social({ tab: 'notifications' })
        ) as never);
      });
    }
    if (
      notification.type === 'friend_request' ||
      notification.type === 'friend_accepted'
    ) {
      void queryClient.invalidateQueries({ queryKey: socialKeys.all(userId) });
    }
    if (notification.type === 'moderation_update') {
      void queryClient.invalidateQueries({
        queryKey: moderationKeys.accountStatus(userId),
      });
      void refreshUser().catch(() => {});
      if (moderationRefreshTimerRef.current != null) {
        clearTimeout(moderationRefreshTimerRef.current);
      }
      moderationRefreshTimerRef.current = setTimeout(() => {
        void refreshUser().catch(() => {});
      }, 750);
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
  }, [markAsRead, queryClient, refreshUser, router, showToast, userId]);

  useEffect(() => {
    setTransportEnabled(isAuthenticated && userId > 0);
  }, [isAuthenticated, userId]);

  useEffect(() => () => {
    if (moderationRefreshTimerRef.current != null) {
      clearTimeout(moderationRefreshTimerRef.current);
    }
  }, []);

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
        void refreshUser().catch(() => {});
        setTransportEnabled(false);
        reconnectTimer = setTimeout(() => setTransportEnabled(true), 0);
      }
    });
    return () => {
      subscription.remove();
      if (reconnectTimer != null) clearTimeout(reconnectTimer);
    };
  }, [isAuthenticated, refreshUser, userId]);

  return null;
}
