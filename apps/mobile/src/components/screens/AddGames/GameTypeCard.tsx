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
  /** Renders the choice as a row inside a shared decision card. */
  readonly grouped?: boolean;
  /** Adds the separator used between rows in a shared decision card. */
  readonly showDivider?: boolean;
}

export default function GameTypeCard({
  testID,
  icon,
  iconBgClass,
  title,
  description,
  onPress,
  grouped = false,
  showDivider = false,
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
      accessibilityHint={description}
      className={`flex-row items-center gap-[14px] bg-surface px-4 py-[18px] active:bg-inset ${
        grouped
          ? showDivider
            ? 'border-b border-divider'
            : ''
          : 'rounded-[14px] border border-divider mb-3 active:border-brand-teal'
      }`}
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
