/**
 * ListItem — configurable list row with icon, title, subtitle, badge, and chevron.
 * 56px minimum height, Pressable with ripple/highlight feedback.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import AppText from '@/components/ui/AppText';
import Svg, { Path } from 'react-native-svg';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface ListItemProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly leftIcon?: React.ReactNode;
  readonly rightElement?: React.ReactNode;
  readonly showChevron?: boolean;
  readonly onPress?: () => void;
  readonly badge?: string | number;
  readonly className?: string;
}

function ChevronRight({ color }: { color: string }): React.ReactNode {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 5l7 7-7 7"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ListItem({
  title,
  subtitle,
  leftIcon,
  rightElement,
  showChevron = false,
  onPress,
  badge,
  className = '',
}: ListItemProps): React.ReactNode {
  const palette = usePaletteColors();
  const chevronColor = palette.textTertiary;

  const content = (
    <View className="flex-row items-center px-4 gap-3 min-h-[56px] py-2">
      {leftIcon && (
        <View className="w-8 h-8 items-center justify-center">{leftIcon}</View>
      )}
      <View className="flex-1">
        <AppText className="text-sm font-medium text-default" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle && (
          <AppText className="text-xs text-muted mt-0.5" numberOfLines={1}>
            {subtitle}
          </AppText>
        )}
      </View>
      {badge !== undefined && (
        <View className="bg-brand-teal rounded-full px-2 py-0.5 min-w-[20px] items-center">
          <AppText className="text-on-brand-teal text-xs font-semibold">
            {badge}
          </AppText>
        </View>
      )}
      {rightElement}
      {showChevron && !rightElement && <ChevronRight color={chevronColor} />}
    </View>
  );

  if (!onPress) {
    return <View className={`bg-surface ${className}`}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      className={`bg-surface active:opacity-70 ${className}`}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {content}
    </Pressable>
  );
}
