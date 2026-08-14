/**
 * GameTypeCard — a single tappable tile on the Add Games chooser screen.
 * Mirrors the `.game-type-card` wireframe shape:
 *   icon-bg | title + description | chevron
 *
 * The caller supplies the icon background color class, title, description,
 * and onPress handler. Haptic feedback fires on every press.
 */

import React, { useCallback } from 'react';
import AppText from '@/components/ui/AppText';
import { Pressable, View } from 'react-native';
import { ChevronRightIcon } from '@/components/ui/icons';
import { hapticMedium } from '@/utils/haptics';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  const palette = usePaletteColors();
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
      className="flex-row items-center gap-[14px] bg-surface rounded-[14px] px-4 py-[18px] border border-divider mb-3 active:border active:border-brand-teal"
    >
      {/* Icon container */}
      <View
        className={`w-12 h-12 rounded-[12px] items-center justify-center ${iconBgClass}`}
      >
        {icon}
      </View>

      {/* Text block */}
      <View className="flex-1">
        <AppText className="text-[15px] font-bold text-default mb-[3px]">
          {title}
        </AppText>
        <AppText className="text-[12px] text-muted leading-[1.4]">
          {description}
        </AppText>
      </View>

      {/* Chevron */}
      <ChevronRightIcon size={20} color={palette.textTertiary} />
    </Pressable>
  );
}
