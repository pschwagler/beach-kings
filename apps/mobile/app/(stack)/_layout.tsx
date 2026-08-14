/**
 * Stack navigator for detail screens pushed from tabs.
 * Each screen renders its own TopNav — no default header.
 */

import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import AddNewPlayerProvider from '@/contexts/AddNewPlayerContext';
import InvitePlayersProvider from '@/contexts/InvitePlayersContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';

export default function StackLayout(): React.ReactNode {
  const { isDark } = useTheme();

  return (
    // Bridges sibling screens in this stack that can't share props directly:
    //   AddNewPlayerProvider — score-game ↔ add-new-player formSheet
    //   InvitePlayersProvider — session-detail ↔ invite-players
    <AddNewPlayerProvider>
      <InvitePlayersProvider>
        <Stack
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            contentStyle: {
              backgroundColor: isDark ? darkColors.bgBase : colors.bgPrimary,
            },
            animation: 'slide_from_right',
          }}
        />
      </InvitePlayersProvider>
    </AddNewPlayerProvider>
  );
}
