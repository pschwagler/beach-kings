/**
 * Brand-specific top header for the Home tab.
 * Beach League brand lockup on the left.
 * Messages + Notifications icon buttons (with badges) + avatar on the right.
 * Mirrors `mobile-audit/wireframes/home.html` `.top-nav`.
 */

import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from '@/components/ui/Avatar';
import { ChatIcon, BellIcon } from '@/components/ui/icons';
import { routes } from '@/lib/navigation';
import { usePaletteColors } from '@/theme/usePaletteColors';
import UnreadBadge from '@/components/ui/UnreadBadge';
import { BrandLockup, BrandMark } from '@/components/brand/BrandImage';

interface HomeHeaderProps {
  readonly userName: string;
  readonly avatarUrl?: string | null;
  /**
   * Current user's player id. Seeds a stable, identity-derived avatar color so
   * the same player renders the same color here as on every other screen (S2).
   */
  readonly playerId?: number | null;
  readonly dmUnreadCount: number;
  readonly notificationUnreadCount: number;
}

export default function HomeHeader({
  userName,
  avatarUrl,
  playerId,
  dmUnreadCount,
  notificationUnreadCount,
}: HomeHeaderProps): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();
  const { fontScale } = useWindowDimensions();
  const showWordmark = fontScale <= 1;

  return (
    <View
      className="h-nav-bar bg-nav flex-row items-center justify-between px-lg border-b border-divider"
      accessibilityRole="header"
      accessibilityLabel="Beach League home"
    >
      <View className="flex-row items-center">
        {showWordmark ? (
          <BrandLockup
            surface="dark"
            width={118}
            accessible={false}
            testID="home-brand-lockup"
          />
        ) : (
          <BrandMark
            surface="dark"
            size={30}
            accessible={false}
            testID="home-brand-mark"
          />
        )}
      </View>

      <View className="flex-row items-center gap-3">
        <Pressable
          className="w-11 h-11 rounded-full border border-inverse items-center justify-center"
          onPress={() => router.navigate(routes.social({ tab: 'messages' }))}
          accessibilityLabel={`Messages${dmUnreadCount > 0 ? `, ${dmUnreadCount} unread` : ''}`}
          accessibilityRole="button"
        >
          <ChatIcon size={22} color={palette.textInverse} />
          <UnreadBadge
            count={dmUnreadCount}
            borderColor={palette.bgNav}
            className="absolute top-0.5 right-0.5"
            testID="messages-unread-badge"
          />
        </Pressable>

        <Pressable
          className="w-11 h-11 rounded-full border border-inverse items-center justify-center"
          onPress={() =>
            router.navigate(routes.notifications())
          }
          accessibilityLabel={`Notifications${notificationUnreadCount > 0 ? `, ${notificationUnreadCount} unread` : ''}`}
          accessibilityRole="button"
        >
          <BellIcon size={22} color={palette.textInverse} />
          <UnreadBadge
            count={notificationUnreadCount}
            borderColor={palette.bgNav}
            className="absolute top-0.5 right-0.5"
            testID="notifications-unread-badge"
          />
        </Pressable>

        <Pressable
          onPress={() => router.push(routes.profile())}
          accessibilityLabel="My profile"
          accessibilityRole="button"
        >
          <Avatar
            name={userName}
            imageUrl={avatarUrl}
            size="sm"
            colorSeed={playerId ?? undefined}
          />
        </Pressable>
      </View>
    </View>
  );
}
