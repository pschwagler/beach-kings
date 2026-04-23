/**
 * Profile completion banner with gold progress ring.
 * Rendered when the user's profile is incomplete.
 * Mirrors `home.html` `.profile-banner`.
 */

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { ChevronRightIcon, XIcon } from '@/components/ui/icons';
import { routes } from '@/lib/navigation';

interface ProfileBannerProps {
  readonly percent: number;
  readonly onDismiss?: () => void;
}

function ProgressRing({ percent }: { readonly percent: number }): React.ReactNode {
  const radius = 14;
  const circumference = 2 * Math.PI * radius;
  const safe = Math.max(0, Math.min(100, percent));
  const dashOffset = circumference * (1 - safe / 100);

  return (
    <View className="w-[44px] h-[44px] items-center justify-center">
      <Svg
        width={44}
        height={44}
        viewBox="0 0 44 44"
        style={{ transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={22}
          cy={22}
          r={radius}
          stroke="#f0f0f0"
          strokeWidth={4}
          fill="none"
        />
        <Circle
          cx={22}
          cy={22}
          r={radius}
          stroke="#d4a843"
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          fill="none"
        />
      </Svg>
      <View className="absolute inset-0 items-center justify-center">
        <Text className="text-[11px] font-bold text-primary dark:text-content-primary">
          {Math.round(safe)}%
        </Text>
      </View>
    </View>
  );
}

export default function ProfileBanner({
  percent,
  onDismiss,
}: ProfileBannerProps): React.ReactNode {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(routes.onboarding())}
      accessibilityRole="link"
      accessibilityLabel="Finish setting up your profile"
      className="bg-white dark:bg-dark-surface rounded-card px-lg py-md mb-md flex-row items-center gap-md shadow-sm dark:shadow-none dark:border dark:border-border-subtle border-l-[3px] border-l-accent"
    >
      <ProgressRing percent={percent} />
      <View className="flex-1">
        <Text className="text-subhead font-bold text-text-default dark:text-content-primary mb-0.5">
          Finish setting up your profile
        </Text>
        <Text className="text-caption text-gray-600 dark:text-content-tertiary">
          Add your level and location to get matched with players
        </Text>
      </View>
      <ChevronRightIcon size={18} color="#cccccc" />
      {onDismiss != null && (
        <Pressable
          onPress={onDismiss}
          accessibilityLabel="Dismiss profile banner"
          accessibilityRole="button"
          className="absolute top-2 right-2 w-[22px] h-[22px] rounded-full bg-gray-100 dark:bg-elevated items-center justify-center"
          hitSlop={8}
        >
          <XIcon size={11} color="#999999" />
        </Pressable>
      )}
    </Pressable>
  );
}
