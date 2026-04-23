/**
 * NotificationItem — a single notification row.
 *
 * Renders a type-specific colored icon, title, message, timestamp,
 * and for friend_request type: Accept / Decline action buttons.
 *
 * Wireframe ref: notifications.html — .notification-item
 */

import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import type { Notification, NotificationType } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

interface NotificationIconConfig {
  readonly bgClass: string;
  readonly iconColor: string;
}

function getIconConfig(type: NotificationType): NotificationIconConfig {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return { bgClass: 'bg-[#e8f4f8] dark:bg-teal-900', iconColor: '#2a7d9c' };
    case 'direct_message':
      return { bgClass: 'bg-[#e8f4f8] dark:bg-teal-900', iconColor: '#2a7d9c' };
    case 'league_message':
    case 'league_invite':
    case 'league_join_request':
    case 'league_join_rejected':
    case 'member_joined':
    case 'member_removed':
      return { bgClass: 'bg-[#fdf8ed] dark:bg-yellow-900', iconColor: '#c0892a' };
    case 'season_start':
    case 'season_activated':
    case 'season_award':
      return { bgClass: 'bg-[#fdf8ed] dark:bg-yellow-900', iconColor: '#c0892a' };
    case 'session_submitted':
    case 'session_auto_submitted':
    case 'session_auto_deleted':
    case 'placeholder_claimed':
      return { bgClass: 'bg-[#edf7ee] dark:bg-green-900', iconColor: '#2d7a3a' };
    default:
      return { bgClass: 'bg-[#f0f0f0] dark:bg-dark-elevated', iconColor: '#666' };
  }
}

interface TypeIconProps {
  readonly type: NotificationType;
  readonly color: string;
}

function TypeIcon({ type, color }: TypeIconProps): React.ReactNode {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Circle cx="10" cy="8" r="3" stroke={color} strokeWidth={1.8} />
          <Path
            d="M4 20c0-4 2.686-6 6-6"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M16 14v6M13 17h6"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'direct_message':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'season_start':
    case 'season_activated':
    case 'season_award':
    case 'league_invite':
    case 'league_message':
    case 'league_join_request':
    case 'league_join_rejected':
    case 'member_joined':
    case 'member_removed':
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="2"
            stroke={color}
            strokeWidth={1.8}
          />
          <Path
            d="M3 10h18"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
          <Path
            d="M8 2v4M16 2v4"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
          />
        </Svg>
      );
    default:
      return (
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M13.73 21a2 2 0 01-3.46 0"
            stroke={color}
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
  }
}

// ---------------------------------------------------------------------------
// Timestamp
// ---------------------------------------------------------------------------

function formatNotificationTime(isoString: string): string {
  const now = new Date();
  const then = new Date(isoString);
  const diffMs = now.getTime() - then.getTime();
  const diffMinutes = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface NotificationItemProps {
  readonly notification: Notification;
  readonly onPress: (notification: Notification) => void;
  readonly onAcceptFriendRequest?: (notification: Notification) => void;
  readonly onDeclineFriendRequest?: (notification: Notification) => void;
}

export default function NotificationItem({
  notification,
  onPress,
  onAcceptFriendRequest,
  onDeclineFriendRequest,
}: NotificationItemProps): React.ReactNode {
  const { bgClass, iconColor } = getIconConfig(notification.type);

  const handlePress = useCallback(() => {
    void hapticLight();
    onPress(notification);
  }, [onPress, notification]);

  const handleAccept = useCallback(() => {
    void hapticMedium();
    onAcceptFriendRequest?.(notification);
  }, [onAcceptFriendRequest, notification]);

  const handleDecline = useCallback(() => {
    void hapticMedium();
    onDeclineFriendRequest?.(notification);
  }, [onDeclineFriendRequest, notification]);

  const isFriendRequest = notification.type === 'friend_request';

  return (
    <Pressable
      testID={`notification-item-${notification.id}`}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={notification.title}
      className={`flex-row items-start gap-3 px-4 py-[14px] border-b border-[#f0f0f0] dark:border-border-strong active:opacity-70 ${
        notification.is_read
          ? 'bg-white dark:bg-dark-surface'
          : 'bg-[#fdf8ed] dark:bg-yellow-950'
      }`}
    >
      {/* Icon */}
      <View
        className={`w-11 h-11 rounded-full ${bgClass} items-center justify-center flex-shrink-0 mt-[2px]`}
      >
        <TypeIcon type={notification.type} color={iconColor} />
      </View>

      {/* Content */}
      <View className="flex-1 min-w-0">
        <Text
          className={`text-[14px] leading-[1.4] ${
            notification.is_read
              ? 'font-normal text-text-default dark:text-content-primary'
              : 'font-semibold text-text-default dark:text-content-primary'
          }`}
          numberOfLines={2}
        >
          {notification.title}
        </Text>
        {notification.message.length > 0 && (
          <Text
            className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]"
            numberOfLines={2}
          >
            {notification.message}
          </Text>
        )}
        <Text className="text-[11px] text-[#999] dark:text-content-tertiary mt-[4px]">
          {formatNotificationTime(notification.created_at)}
        </Text>

        {/* Friend request actions */}
        {isFriendRequest && !notification.is_read && (
          <View className="flex-row gap-2 mt-[10px]">
            <Pressable
              testID={`notif-accept-btn-${notification.id}`}
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept friend request"
              className="px-[14px] py-[8px] rounded-[8px] bg-[#1a3a4a] dark:bg-brand-teal min-h-[40px] justify-center active:opacity-80"
            >
              <Text className="text-[12px] font-bold text-white">Accept</Text>
            </Pressable>
            <Pressable
              testID={`notif-decline-btn-${notification.id}`}
              onPress={handleDecline}
              accessibilityRole="button"
              accessibilityLabel="Decline friend request"
              className="px-[14px] py-[8px] rounded-[8px] border border-[#ccc] dark:border-border-strong min-h-[40px] justify-center active:opacity-70"
            >
              <Text className="text-[12px] font-bold text-text-secondary dark:text-content-secondary">
                Decline
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Unread dot */}
      {!notification.is_read && (
        <View
          testID={`unread-dot-${notification.id}`}
          className="w-2 h-2 rounded-full bg-[#c0892a] dark:bg-brand-gold mt-[6px] flex-shrink-0"
        />
      )}
    </Pressable>
  );
}
