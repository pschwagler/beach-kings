import React from 'react';
import { Stack } from 'expo-router';
import { FeedbackScreen } from '@/components/screens/Settings';

export default function FeedbackRoute(): React.ReactNode {
  return (
    <>
      <Stack.Screen
        options={{
          presentation: 'modal',
          gestureEnabled: true,
          animation: 'slide_from_bottom',
        }}
      />
      <FeedbackScreen />
    </>
  );
}
