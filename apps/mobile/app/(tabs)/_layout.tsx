import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { colors, darkColors } from '@beach-kings/shared/tokens';
import { useTheme } from '@/contexts/ThemeContext';
import { useNotifications } from '@/features/notifications';
import { HomeIcon, TrophyIcon, PlusIcon, ChatIcon, UserIcon } from '@/components/ui/icons';
import { scrollRootTabToTop, type RootTabKey } from '@/lib/rootTabScroll';

function scrollOnRetap(tab: RootTabKey) {
  return ({ navigation }: { navigation: { isFocused: () => boolean } }) => ({
    tabPress: () => {
      if (navigation.isFocused()) {
        scrollRootTabToTop(tab);
      }
    },
  });
}

interface TabIconProps {
  readonly icon: React.ComponentType<{ size?: number; color?: string }>;
  readonly focused: boolean;
  readonly isAddGames?: boolean;
  readonly isDark: boolean;
  readonly badge?: number;
}

function TabIcon({ icon: Icon, focused, isAddGames, isDark, badge }: TabIconProps): React.ReactNode {
  if (isAddGames) {
    return (
      <View className="w-11 h-11 -mt-3 rounded-full bg-brand-gold items-center justify-center">
        <Icon size={22} color={isDark ? '#1a1a2e' : '#ffffff'} />
      </View>
    );
  }

  const color = focused
    ? (isDark ? darkColors.brandTeal : colors.primary)
    : (isDark ? darkColors.textTertiary : colors.textTertiary);

  return (
    <View>
      <Icon size={22} color={color} />
      {badge != null && badge > 0 && (
        <View className="absolute -top-1 -right-2 bg-red-600 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
          <Text className="text-white text-[10px] font-bold leading-none">
            {badge > 99 ? '99+' : badge}
          </Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout(): React.ReactNode {
  const { isDark } = useTheme();
  const { unreadCount } = useNotifications();

  return (
    <Tabs
      // Android system-back policy while sitting on a tab (tab switches are
      // lateral, not pushes, so they are not in the root stack history).
      // 'firstRoute' = back from any tab returns to Home (the first tab), then
      // exits the app — the least-surprising, platform-standard behavior.
      // Flip to 'history' if we want back to retrace visited tabs instead.
      // No-op on iOS, which has no system back for tabs. See docs/navigation.md.
      backBehavior="firstRoute"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: isDark ? darkColors.brandTeal : colors.primary,
        tabBarInactiveTintColor: isDark ? darkColors.textTertiary : colors.textTertiary,
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarStyle: {
          height: 82,
          paddingBottom: 28,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: isDark ? darkColors.border : colors.gray200,
          backgroundColor: isDark ? darkColors.bgTabbar : colors.bgSurface,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="home"
        listeners={scrollOnRetap('home')}
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={HomeIcon} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="leagues"
        listeners={scrollOnRetap('leagues')}
        options={{
          title: 'Leagues',
          tabBarAccessibilityLabel: 'Leagues tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={TrophyIcon} focused={focused} isDark={isDark} />
          ),
        }}
      />
      <Tabs.Screen
        name="add-games"
        listeners={scrollOnRetap('add-games')}
        options={{
          title: 'Add Games',
          tabBarAccessibilityLabel: 'Add games tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={PlusIcon} focused={focused} isAddGames isDark={isDark} />
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            color: isDark ? darkColors.brandGold : colors.accent,
          },
        }}
      />
      <Tabs.Screen
        name="social"
        listeners={scrollOnRetap('social')}
        options={{
          title: 'Social',
          tabBarAccessibilityLabel: 'Social tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon
              icon={ChatIcon}
              focused={focused}
              isDark={isDark}
              badge={unreadCount}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        listeners={scrollOnRetap('profile')}
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarIcon: ({ focused }) => (
            <TabIcon icon={UserIcon} focused={focused} isDark={isDark} />
          ),
        }}
      />
    </Tabs>
  );
}
