/**
 * Badge component for status indicators and counts.
 * Dark mode: semantic bg/text pairs for each variant.
 */

import React from 'react';
import { View } from 'react-native';
import AppText from './AppText';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

interface BadgeProps {
  readonly label: string;
  readonly variant?: BadgeVariant;
  readonly className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: {
    bg: 'bg-elevated',
    text: 'text-default',
  },
  success: {
    bg: 'bg-success-tint',
    text: 'text-success',
  },
  danger: {
    bg: 'bg-danger-tint',
    text: 'text-danger',
  },
  warning: {
    bg: 'bg-warning-tint',
    text: 'text-warning',
  },
  info: {
    bg: 'bg-info-tint',
    text: 'text-info',
  },
  accent: {
    bg: 'bg-warning-tint',
    text: 'text-accent',
  },
};

export default function Badge({
  label,
  variant = 'default',
  className = '',
}: BadgeProps): React.ReactNode {
  const styles = variantStyles[variant];

  return (
    <View className={`px-sm py-xxs rounded-full ${styles.bg} ${className}`}>
      <AppText className={`text-caption font-medium ${styles.text}`}>
        {label}
      </AppText>
    </View>
  );
}
