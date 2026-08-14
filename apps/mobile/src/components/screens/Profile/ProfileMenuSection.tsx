/**
 * ProfileMenuSection — settings shortcuts and logout.
 * Matches the bottom action rows in profile.html wireframe.
 */

import React from 'react';
import AppText from '@/components/ui/AppText';
import { View, Pressable, Alert } from 'react-native';
import { hapticMedium } from '@/utils/haptics';

interface MenuRowProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel?: string;
  readonly danger?: boolean;
}

function MenuRow({ label, onPress, accessibilityLabel, danger = false }: MenuRowProps): React.ReactNode {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      className="flex-row items-center justify-between py-md px-lg bg-surface border-b border-divider active:opacity-70"
    >
      <AppText
        className={`text-sm font-medium ${
          danger ? 'text-danger' : 'text-default'
        }`}
      >
        {label}
      </AppText>
      {!danger && (
        <AppText className="text-muted text-lg leading-none">
          {'›'}
        </AppText>
      )}
    </Pressable>
  );
}

interface ProfileMenuSectionProps {
  readonly onSettingsPress: () => void;
  readonly onMyStatsPress: () => void;
  readonly onMyGamesPress: () => void;
  readonly onFriendsPress: () => void;
  readonly onLogout: () => Promise<void>;
}

export default function ProfileMenuSection({
  onSettingsPress,
  onMyStatsPress,
  onMyGamesPress,
  onFriendsPress,
  onLogout,
}: ProfileMenuSectionProps): React.ReactNode {
  function handleLogoutPress(): void {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: () => {
            void hapticMedium();
            void onLogout();
          },
        },
      ],
      { cancelable: true },
    );
  }

  return (
    <View className="mt-lg mb-xxxl">
      <AppText className="text-2xs uppercase tracking-wide font-semibold text-muted px-lg mb-xs">
        Activity
      </AppText>
      <View className="rounded-xl overflow-hidden mx-lg mb-lg">
        <MenuRow label="My Stats" onPress={onMyStatsPress} accessibilityLabel="My Stats" />
        <MenuRow label="My Games" onPress={onMyGamesPress} accessibilityLabel="My Games" />
        <MenuRow label="Friends" onPress={onFriendsPress} accessibilityLabel="Friends" />
      </View>

      <AppText className="text-2xs uppercase tracking-wide font-semibold text-muted px-lg mb-xs">
        Account
      </AppText>
      <View className="rounded-xl overflow-hidden mx-lg">
        <MenuRow label="Settings" onPress={onSettingsPress} accessibilityLabel="Settings" />
        <MenuRow
          label="Log Out"
          onPress={handleLogoutPress}
          accessibilityLabel="Log Out"
          danger
        />
      </View>
    </View>
  );
}
