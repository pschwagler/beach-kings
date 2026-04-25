/**
 * BottomTabBar — replicates the (tabs) layout tab bar so stack screens
 * (e.g. league detail) can render the same bottom navigation per the
 * wireframes. Tapping a tab routes back to the corresponding (tabs) screen.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, darkColors } from '@beach-kings/shared/tokens';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/contexts/NotificationContext';
import { HomeIcon, TrophyIcon, PlusIcon, ChatIcon, UserIcon } from '@/components/ui/icons';
import { hapticLight } from '@/utils/haptics';

export type BottomTabKey = 'home' | 'leagues' | 'add-games' | 'social' | 'profile';

interface BottomTabBarProps {
  readonly active: BottomTabKey;
}

interface TabDef {
  readonly key: BottomTabKey;
  readonly label: string;
  readonly icon: React.ComponentType<{ size?: number; color?: string }>;
  readonly route: string;
  readonly isCenter?: boolean;
  readonly accessibilityLabel: string;
}

const TABS: readonly TabDef[] = [
  { key: 'home', label: 'Home', icon: HomeIcon, route: '/(tabs)/home', accessibilityLabel: 'Home tab' },
  { key: 'leagues', label: 'Leagues', icon: TrophyIcon, route: '/(tabs)/leagues', accessibilityLabel: 'Leagues tab' },
  { key: 'add-games', label: 'Add Games', icon: PlusIcon, route: '/(tabs)/add-games', isCenter: true, accessibilityLabel: 'Add games tab' },
  { key: 'social', label: 'Social', icon: ChatIcon, route: '/(tabs)/social', accessibilityLabel: 'Social tab' },
  { key: 'profile', label: 'Profile', icon: UserIcon, route: '/(tabs)/profile', accessibilityLabel: 'Profile tab' },
];

export default function BottomTabBar({ active }: BottomTabBarProps): React.ReactNode {
  const router = useRouter();
  const { isDark } = useTheme();
  const { unreadCount } = useNotifications();
  const insets = useSafeAreaInsets();

  const activeColor = isDark ? darkColors.brandTeal : colors.primary;
  const inactiveColor = isDark ? darkColors.textTertiary : colors.textTertiary;
  const bgColor = isDark ? darkColors.bgTabbar : colors.bgSurface;
  const borderColor = isDark ? darkColors.border : colors.gray200;

  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <View
      testID="bottom-tab-bar"
      style={{
        backgroundColor: bgColor,
        borderTopWidth: 1,
        borderTopColor: borderColor,
        paddingTop: 8,
        paddingBottom: bottomPadding,
        flexDirection: 'row',
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        const tintColor = isActive ? activeColor : inactiveColor;
        const Icon = tab.icon;
        const showBadge = tab.key === 'social' && unreadCount > 0;

        return (
          <Pressable
            key={tab.key}
            testID={`bottom-tab-${tab.key}`}
            accessibilityRole="button"
            accessibilityLabel={tab.accessibilityLabel}
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              void hapticLight();
              router.push(tab.route);
            }}
            className="flex-1 items-center justify-center"
          >
            {tab.isCenter ? (
              <View
                style={{
                  width: 44,
                  height: 44,
                  marginTop: -12,
                  borderRadius: 22,
                  backgroundColor: isDark ? darkColors.brandGold : colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon size={22} color={isDark ? '#1a1a2e' : '#ffffff'} />
              </View>
            ) : (
              <View>
                <Icon size={22} color={tintColor} />
                {showBadge && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -4,
                      right: -8,
                      backgroundColor: '#dc2626',
                      borderRadius: 999,
                      minWidth: 16,
                      height: 16,
                      paddingHorizontal: 4,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text
                      style={{
                        color: '#ffffff',
                        fontSize: 10,
                        fontWeight: '700',
                        lineHeight: 10,
                      }}
                    >
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </Text>
                  </View>
                )}
              </View>
            )}
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                marginTop: 2,
                color: tab.isCenter ? (isDark ? darkColors.brandGold : colors.accent) : tintColor,
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
