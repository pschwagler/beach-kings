/**
 * Floating Action Button (FAB) component.
 * 44px minimum touch target, fixed bottom-right positioning.
 * Dark mode: brand colors adjusted for dark surfaces.
 */

import React from 'react';
import { Pressable, Text } from 'react-native';

interface FABProps {
  readonly onPress: () => void;
  readonly label?: string;
  readonly icon?: React.ReactNode;
  readonly className?: string;
  readonly accessibilityLabel?: string;
}

export default function FAB({
  onPress,
  label,
  icon,
  className = '',
  accessibilityLabel,
}: FABProps): React.ReactNode {
  return (
    <Pressable
      className={`absolute bottom-6 right-4 min-h-[56px] min-w-[56px] items-center justify-center rounded-2xl bg-brand-teal shadow-lg px-md ${label ? 'flex-row gap-xs' : ''} ${className}`}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? label ?? 'Action button'}
      accessibilityRole="button"
    >
      {icon}
      {label ? (
        <Text className="font-semibold text-body text-white">
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
