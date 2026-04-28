/**
 * Button component with variant support.
 * All variants meet 44px minimum touch target.
 * Dark mode: brand colors adjusted for dark surfaces.
 * Haptics: medium impact for primary/secondary/danger, light for outline/ghost.
 */

import React, { useCallback } from 'react';
import { Pressable, Text, ActivityIndicator } from 'react-native';
import { usePaletteColors } from '@/theme/usePaletteColors';
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
    container: 'bg-brand-teal',
    text: 'text-white',
  },
  secondary: {
    container: 'bg-brand-gold',
    text: 'text-white',
  },
  outline: {
    container: 'bg-transparent border border-brand-teal',
    text: 'text-brand-teal',
  },
  ghost: {
    container: 'bg-transparent',
    text: 'text-brand-teal',
  },
  danger: {
    container: 'bg-danger',
    text: 'text-white',
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
  const palette = usePaletteColors();
  const styles = variantStyles[variant];

  const spinnerColor = (() => {
    if (variant === 'outline' || variant === 'ghost') {
      return palette.brandTeal;
    }
    return palette.textInverse;
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
