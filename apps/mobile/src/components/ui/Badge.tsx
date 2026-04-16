/**
 * Badge component for status indicators and counts.
 * Dark mode: semantic bg/text pairs for each variant.
 */

import React from 'react';
import { View, Text } from 'react-native';

type BadgeVariant = 'default' | 'success' | 'danger' | 'warning' | 'info' | 'accent';

interface BadgeProps {
  readonly label: string;
  readonly variant?: BadgeVariant;
  readonly className?: string;
}

const variantStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  default: {
    bg: 'bg-gray-200 dark:bg-elevated',
    text: 'text-text-default dark:text-content-primary',
  },
  success: {
    bg: 'bg-green-100 dark:bg-success-bg',
    text: 'text-success dark:text-success-text',
  },
  danger: {
    bg: 'bg-red-100 dark:bg-danger-bg',
    text: 'text-danger dark:text-danger-text',
  },
  warning: {
    bg: 'bg-amber-100 dark:bg-warning-bg',
    text: 'text-warning dark:text-warning-text',
  },
  info: {
    bg: 'bg-blue-100 dark:bg-info-bg',
    text: 'text-info dark:text-info-text',
  },
  accent: {
    bg: 'bg-amber-100 dark:bg-elevated',
    text: 'text-accent dark:text-brand-gold',
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
      <Text className={`text-caption font-medium ${styles.text}`}>
        {label}
      </Text>
    </View>
  );
}
