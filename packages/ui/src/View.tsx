import React from 'react';
import { YStack, YStackProps } from 'tamagui';
import { ViewStyle } from 'react-native';

interface ViewProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export function View({ children, style }: ViewProps) {
  return (
    <YStack
      {...(style as any)}
    >
      {children}
    </YStack>
  );
}
