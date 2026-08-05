/**
 * NotificationItem — a single notification row.
 *
 * Renders a type-specific colored icon, title, message, timestamp,
 * and for friend_request type: Accept / Decline action buttons.
 *
 * Wireframe ref: notifications.html — .notification-item
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable } from 'react-native';
import Svg, { Path, Circle, Rect } from 'react-native-svg';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import {
  type Notification,
  type NotificationType,
  formatRelativeTime,
} from '@beach-kings/shared';
import { usePaletteColors, type PaletteColors } from '@/theme/usePaletteColors';

// ---------------------------------------------------------------------------
// Icon helpers
// ---------------------------------------------------------------------------

interface NotificationIconConfig {
  readonly bgClass: string;
  readonly iconRole: keyof Pick<PaletteColors, 'info' | 'warning' | 'success' | 'textMuted'>;
}

function getIconConfig(type: NotificationType): NotificationIconConfig {
  switch (type) {
    case 'friend_request':
    case 'friend_accepted':
      return { bgClass: 'bg-info-tint', iconRole: 'info' };
    case 'direct_message':
      return { bgClass: 'bg-info-tint', iconRole: 'info' };
    case 'league_message':
    case 'league_invite':
    case 'league_join_request':
    case 'league_join_rejected':
    case 'member_joined':
    case 'member_removed':
      return { bgClass: 'bg-warning-tint', iconRole: 'warning' };
    case 'season_start':
    case 'season_activated':
    case 'season_award':
      return { bgClass: 'bg-warning-tint', iconRole: 'warning' };
    case 'session_submitted':
    case 'session_auto_submitted':
    case 'session_auto_deleted':
    case 'placeholder_claimed':
      return { bgClass: 'bg-success-tint', iconRole: 'success' };
    default:
      return { bgClass: 'bg-elevated', iconRole: 'textMuted' };
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
  const palette = usePaletteColors();
  const { bgClass, iconRole } = getIconConfig(notification.type);
  const iconColor = palette[iconRole];

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
      className={`flex-row items-start gap-3 px-4 py-[14px] border-b border-divider active:opacity-70 ${
        notification.is_read ? 'bg-surface' : 'bg-warning-tint'
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
        <AppText
          className={`text-[14px] leading-[1.4] ${
            notification.is_read
              ? 'font-normal text-default'
              : 'font-semibold text-default'
          }`}
          numberOfLines={2}
        >
          {notification.title}
        </AppText>
        {notification.message.length > 0 && (
          <AppText
            className="text-[12px] text-muted mt-[2px]"
            numberOfLines={2}
          >
            {notification.message}
          </AppText>
        )}
        <AppText className="text-[11px] text-tertiary mt-[4px]">
          {formatRelativeTime(notification.created_at, { style: 'short' })}
        </AppText>

        {/* Friend request actions */}
        {isFriendRequest && !notification.is_read && (
          <View className="flex-row gap-2 mt-[10px]">
            <Pressable
              testID={`notif-accept-btn-${notification.id}`}
              onPress={handleAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept friend request"
              className="px-[14px] py-[8px] rounded-[8px] bg-brand-teal min-h-touch justify-center active:opacity-80"
            >
              <AppText className="text-[12px] font-bold text-on-brand-teal">Accept</AppText>
            </Pressable>
            <Pressable
              testID={`notif-decline-btn-${notification.id}`}
              onPress={handleDecline}
              accessibilityRole="button"
              accessibilityLabel="Decline friend request"
              className="px-[14px] py-[8px] rounded-[8px] border border-strong min-h-touch justify-center active:opacity-70"
            >
              <AppText className="text-[12px] font-bold text-muted">
                Decline
              </AppText>
            </Pressable>
          </View>
        )}
      </View>

      {/* Unread dot */}
      {!notification.is_read && (
        <View
          testID={`unread-dot-${notification.id}`}
          className="w-2 h-2 rounded-full bg-brand-gold mt-[6px] flex-shrink-0"
        />
      )}
    </Pressable>
  );
}
