import React from 'react';
import { Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { usePaletteColors, type PaletteColors } from '@/theme/usePaletteColors';
import { useNotifications } from '@/features/notifications';
import {
  HomeIcon,
  TrophyIcon,
  PlusIcon,
  ChatIcon,
  UserIcon,
} from '@/components/ui/icons';
import { scrollRootTabToTop, type RootTabKey } from '@/lib/rootTabScroll';
import UnreadBadge from '@/components/ui/UnreadBadge';

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
  readonly palette: PaletteColors;
  readonly badge?: number;
}

function TabIcon({
  icon: Icon,
  focused,
  isAddGames,
  palette,
  badge,
}: TabIconProps): React.ReactNode {
  if (isAddGames) {
    return (
      <View className="w-11 h-11 -mt-3 rounded-full bg-brand-gold items-center justify-center">
        <Icon size={22} color={palette.onBrandGold} />
      </View>
    );
  }

  const color = focused ? palette.brandTeal : palette.textTertiary;

  return (
    <View>
      <Icon size={22} color={color} />
      <UnreadBadge
        count={badge ?? 0}
        borderColor={palette.bgTabbar}
        className="absolute -top-1.5 -right-2.5"
        testID="social-unread-badge"
      />
    </View>
  );
}

export default function TabLayout(): React.ReactNode {
  const palette = usePaletteColors();
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
        tabBarActiveTintColor: palette.brandTeal,
        tabBarInactiveTintColor: palette.textTertiary,
        tabBarHideOnKeyboard: Platform.OS === 'android',
        tabBarStyle: {
          height: 82,
          paddingBottom: 28,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: palette.borderStrong,
          backgroundColor: palette.bgTabbar,
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
            <TabIcon icon={HomeIcon} focused={focused} palette={palette} />
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
            <TabIcon icon={TrophyIcon} focused={focused} palette={palette} />
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
            <TabIcon
              icon={PlusIcon}
              focused={focused}
              isAddGames
              palette={palette}
            />
          ),
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            color: palette.brandGold,
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
              palette={palette}
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
            <TabIcon icon={UserIcon} focused={focused} palette={palette} />
          ),
        }}
      />
    </Tabs>
  );
}
