/**
 * Add-New-Player route — presented as a native formSheet.
 *
 * RN core `<Modal presentationStyle="pageSheet">` collapses its flex content
 * to zero height under the New Architecture (Fabric), so this is a real
 * react-native-screens sheet instead. State flows via AddNewPlayerContext.
 */

import React from 'react';
import { Stack } from 'expo-router';
import { AddNewPlayerScreen } from '@/components/screens/Games';

export default function AddNewPlayerRoute(): React.ReactNode {
  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [1.0],
          sheetGrabberVisible: true,
          sheetCornerRadius: 16,
          gestureEnabled: true,
          animation: 'slide_from_bottom',
        }}
      />
      <AddNewPlayerScreen />
    </>
  );
}
