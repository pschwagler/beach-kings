/**
 * FriendsShortcut — Friends tab content within the Social segmented screen.
 *
 * Shows a CTA to find players, mirroring the friends.html wireframe's
 * empty-state. The full friend list lives in the find-players stack screen.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface FriendsShortcutProps {
  readonly onFindPlayers: () => void;
}

/** Decorative icon placeholder — two overlapping circles representing people. */
function FriendsIcon(): React.ReactNode {
  return (
    <View
      testID="friends-icon"
      style={{
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#e5e7eb',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: '#9ca3af',
        }}
      />
    </View>
  );
}

export default function FriendsShortcut({
  onFindPlayers,
}: FriendsShortcutProps): React.ReactNode {
  return (
    <View
      testID="friends-shortcut"
      className="flex-1 items-center justify-center px-8"
    >
      <View className="mb-4 opacity-40">
        <FriendsIcon />
      </View>

      <Text className="text-base font-bold text-center text-text-default dark:text-content-primary mb-2">
        Connect with players
      </Text>
      <Text className="text-sm text-center text-text-muted dark:text-text-tertiary mb-6">
        Find friends, send requests, and see who you know on the court.
      </Text>

      <Pressable
        testID="find-players-button"
        onPress={onFindPlayers}
        accessibilityRole="button"
        accessibilityLabel="Find Players"
        className="bg-primary dark:bg-brand-teal rounded-xl px-8 py-3 active:opacity-70"
      >
        <Text className="text-white font-bold text-sm">Find Players</Text>
      </Pressable>
    </View>
  );
}
