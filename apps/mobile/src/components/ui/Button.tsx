/**
 * Button component with variant support.
 * All variants meet 44px minimum touch target.
 * Dark mode: brand colors adjusted for dark surfaces.
 * Haptics: medium impact for primary/secondary/danger, light for outline/ghost.
 */

import React, { useCallback } from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';
import { hapticLight, hapticMedium } from '@/utils/haptics';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly className?: string;
}

const variantStyles: Record<ButtonVariant, { container: string; text: string }> = {
  primary: {
    container: 'bg-primary dark:bg-brand-teal',
    text: 'text-white',
  },
  secondary: {
    container: 'bg-accent dark:bg-brand-gold',
    text: 'text-white dark:text-gray-900',
  },
  outline: {
    container: 'bg-transparent border border-primary dark:border-brand-teal',
    text: 'text-primary dark:text-brand-teal',
  },
  ghost: {
    container: 'bg-transparent',
    text: 'text-primary dark:text-brand-teal',
  },
  danger: {
    container: 'bg-danger dark:bg-danger-bg',
    text: 'text-white dark:text-danger-text',
  },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
}: ButtonProps): React.ReactNode {
  const { isDark } = useTheme();
  const styles = variantStyles[variant];

  const spinnerColor = (() => {
    if (variant === 'outline' || variant === 'ghost') {
      return isDark ? darkColors.brandTeal : colors.primary;
    }
    if (variant === 'secondary') {
      return isDark ? colors.textPrimary : colors.textInverse;
    }
    return colors.textInverse;
  })();

  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    if (variant === 'outline' || variant === 'ghost') {
      void hapticLight();
    } else {
      void hapticMedium();
    }
    onPress();
  }, [disabled, loading, variant, onPress]);

  return (
    <Pressable
      className={`min-h-touch rounded-lg items-center justify-center px-lg ${styles.container} ${disabled ? 'opacity-50' : ''} ${className}`}
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <Text className={`font-semibold text-body ${styles.text}`}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}
