/**
 * GameTypeCard — a single tappable tile on the Add Games chooser screen.
 * Mirrors the `.game-type-card` wireframe shape:
 *   icon-bg | title + description | chevron
 *
 * The caller supplies the icon background color class, title, description,
 * and onPress handler. Haptic feedback fires on every press.
 */

import React, { useCallback } from 'react';
import { Pressable, View, Text } from 'react-native';
import { ChevronRightIcon } from '@/components/ui/icons';
import { hapticMedium } from '@/utils/haptics';

interface GameTypeCardProps {
  /** testID used for interaction in tests. */
  readonly testID?: string;
  /** Icon element rendered inside the colored square. */
  readonly icon: React.ReactNode;
  /** NativeWind bg class applied to the icon container, e.g. "bg-teal-100". */
  readonly iconBgClass: string;
  readonly title: string;
  readonly description: string;
  readonly onPress: () => void;
}

export default function GameTypeCard({
  testID,
  icon,
  iconBgClass,
  title,
  description,
  onPress,
}: GameTypeCardProps): React.ReactNode {
  const handlePress = useCallback(() => {
    void hapticMedium();
    onPress();
  }, [onPress]);

  return (
    <Pressable
      testID={testID}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-[14px] bg-white dark:bg-dark-surface rounded-[14px] px-4 py-[18px] shadow-sm dark:shadow-none dark:border dark:border-border-subtle mb-3 active:border active:border-accent"
    >
      {/* Icon container */}
      <View
        className={`w-12 h-12 rounded-[12px] items-center justify-center ${iconBgClass}`}
      >
        {icon}
      </View>

      {/* Text block */}
      <View className="flex-1">
        <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mb-[3px]">
          {title}
        </Text>
        <Text className="text-[12px] text-text-muted dark:text-content-tertiary leading-[1.4]">
          {description}
        </Text>
      </View>

      {/* Chevron */}
      <ChevronRightIcon size={20} color="#cccccc" />
    </Pressable>
  );
}
