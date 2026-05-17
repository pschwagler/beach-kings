/**
 * Stack navigator for detail screens pushed from tabs.
 * Each screen renders its own TopNav — no default header.
 */

import React from 'react';
import { Stack } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import AddNewPlayerProvider from '@/contexts/AddNewPlayerContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';

export default function StackLayout(): React.ReactNode {
  const { isDark } = useTheme();

  return (
    // Bridges the score-game screen and the add-new-player formSheet route,
    // which are sibling screens in this stack and can't share props directly.
    <AddNewPlayerProvider>
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
    </AddNewPlayerProvider>
  );
}
