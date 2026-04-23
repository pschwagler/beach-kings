/**
 * Brand-specific top header for the Home tab.
 * Crown icon + BEACH LEAGUE wordmark on the left.
 * Messages + Notifications icon buttons (with badges) + avatar on the right.
 * Mirrors `mobile-audit/wireframes/home.html` `.top-nav`.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import Avatar from '@/components/ui/Avatar';
import { CrownIcon, ChatIcon, BellIcon } from '@/components/ui/icons';
import { routes } from '@/lib/navigation';

interface HomeHeaderProps {
  readonly userName: string;
  readonly avatarUrl?: string | null;
  readonly dmUnreadCount: number;
  readonly notificationUnreadCount: number;
}

function Badge({ count }: { readonly count: number }): React.ReactNode {
  if (count <= 0) return null;
  const label = count > 99 ? '99+' : String(count);
  return (
    <View
      className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] rounded-full bg-danger items-center justify-center px-1 border-2 border-nav dark:border-nav-dark"
    >
      <Text className="text-white font-bold text-[10px] leading-none">
        {label}
      </Text>
    </View>
  );
}

export default function HomeHeader({
  userName,
  avatarUrl,
  dmUnreadCount,
  notificationUnreadCount,
}: HomeHeaderProps): React.ReactNode {
  const router = useRouter();

  return (
    <View
      className="h-nav-bar bg-nav dark:bg-nav-dark flex-row items-center justify-between px-lg dark:border-b dark:border-border-subtle"
      accessibilityRole="header"
    >
      <View className="flex-row items-center gap-2">
        <CrownIcon size={20} color="#d4a843" />
        <Text className="text-white font-bold text-headline tracking-wider">
          BEACH LEAGUE
        </Text>
      </View>

      <View className="flex-row items-center gap-3">
        <Pressable
          className="w-11 h-11 rounded-full bg-white/15 items-center justify-center"
          onPress={() => router.push(routes.messagesList())}
          accessibilityLabel={`Messages${dmUnreadCount > 0 ? `, ${dmUnreadCount} unread` : ''}`}
          accessibilityRole="button"
        >
          <ChatIcon size={22} color="#ffffff" />
          <Badge count={dmUnreadCount} />
        </Pressable>

        <Pressable
          className="w-11 h-11 rounded-full bg-white/15 items-center justify-center"
          onPress={() => router.push(routes.notifications())}
          accessibilityLabel={`Notifications${notificationUnreadCount > 0 ? `, ${notificationUnreadCount} unread` : ''}`}
          accessibilityRole="button"
        >
          <BellIcon size={22} color="#ffffff" />
          <Badge count={notificationUnreadCount} />
        </Pressable>

        <Pressable
          onPress={() => router.push(routes.profile())}
          accessibilityLabel="My profile"
          accessibilityRole="button"
        >
          <Avatar name={userName} imageUrl={avatarUrl} size="sm" />
        </Pressable>
      </View>
    </View>
  );
}
