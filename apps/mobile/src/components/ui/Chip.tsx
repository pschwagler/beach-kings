/**
 * Chip component — filter chip / pill selector.
 * Active: teal bg + white text. Inactive: gray bg + dark text.
 * Minimum 44px touch target height.
 */

import React from 'react';
import { Pressable, Text } from 'react-native';

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
          ? 'bg-primary dark:bg-brand-teal'
          : 'bg-gray-200 dark:bg-gray-700'
      } ${className}`}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Text
        className={`text-sm font-medium ${
          active
            ? 'text-white'
            : 'text-text-default dark:text-content-primary'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
