/**
 * Chip component — filter chip / pill selector.
 * Active: teal bg + white text. Inactive: gray bg + dark text.
 * Minimum 44px touch target height.
 */

import React from 'react';
import { Pressable } from 'react-native';
import AppText from './AppText';

interface ChipProps {
  readonly label: string;
  readonly active?: boolean;
  readonly onPress?: () => void;
  readonly className?: string;
}

export default function Chip({
  label,
  active = false,
  onPress,
  className = '',
}: ChipProps): React.ReactNode {
  return (
    <Pressable
      onPress={onPress}
      className={`min-h-touch items-center justify-center px-md rounded-full ${
        active
          ? 'bg-brand-teal'
          : 'bg-elevated'
      } ${className}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <AppText
        className={`text-sm font-medium ${
          active
            ? 'text-on-brand-teal'
            : 'text-default'
        }`}
      >
        {label}
      </AppText>
    </Pressable>
  );
}
