import React from 'react';
import { View } from 'react-native';
import AppText from '@/components/ui/AppText';
import Button from '@/components/ui/Button';

interface Props {
  readonly onRetry: () => void;
  readonly onSignOut: () => void;
}

export default function SessionRestoreNotice({ onRetry, onSignOut }: Props): React.ReactNode {
  return (
    <View className="flex-1 justify-center bg-surface px-6 gap-4">
      <AppText className="text-xl font-bold text-default" accessibilityRole="header">
        Couldn't reconnect
      </AppText>
      <AppText className="text-base text-muted">
        Your saved sign-in is still on this device. Check your connection and try again.
      </AppText>
      <Button title="Try again" onPress={onRetry} testID="retry-session-restore" />
      <Button title="Sign in with another account" onPress={onSignOut} variant="ghost" />
    </View>
  );
}
