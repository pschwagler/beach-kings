import React from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import AppText from '@/components/ui/AppText';
import { routes } from '@/lib/navigation';

/** Always visible on Home, including while dashboard data is loading/offline. */
export default function EarlyReleaseFeedback(): React.ReactNode {
  const router = useRouter();
  return (
    <Pressable
      testID="home-feedback"
      accessibilityRole="button"
      accessibilityLabel="Leave Feedback"
      accessibilityHint="Help improve this early release"
      onPress={() => router.push(routes.settingsFeedback())}
      className="min-h-touch border-b border-divider bg-info-tint px-lg py-sm active:opacity-80"
    >
      <AppText className="text-caption font-semibold text-info">New app. Help shape it.</AppText>
      <AppText className="text-callout font-bold text-info">Leave Feedback →</AppText>
    </Pressable>
  );
}
