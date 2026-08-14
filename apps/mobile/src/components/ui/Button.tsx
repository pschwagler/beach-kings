/**
 * Button component with variant support.
 * All variants meet 44px minimum touch target.
 * Dark mode: brand colors adjusted for dark surfaces.
 * Haptics: medium impact for primary/secondary/danger, light for outline/ghost.
 */

import React, { useCallback } from 'react';
import { Pressable, ActivityIndicator } from 'react-native';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import AppText from './AppText';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';

interface ButtonProps {
  readonly title: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly className?: string;
  readonly testID?: string;
}

const variantStyles: Record<
  ButtonVariant,
  { container: string; text: string }
> = {
  primary: {
    container: 'bg-brand-teal',
    text: 'text-on-brand-teal',
  },
  secondary: {
    container: 'bg-brand-gold',
    text: 'text-on-brand-gold',
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
    container: 'bg-danger-fill',
    text: 'text-on-danger',
  },
};

export default function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  className = '',
  testID,
}: ButtonProps): React.ReactNode {
  const palette = usePaletteColors();
  const styles = variantStyles[variant];

  const containerStyle = (() => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: palette.brandTeal };
      case 'secondary':
        return { backgroundColor: palette.brandGold };
      case 'danger':
        return { backgroundColor: palette.dangerFill };
      case 'outline':
        return { borderColor: palette.brandTeal };
      case 'ghost':
        return undefined;
    }
  })();

  const textColor = (() => {
    switch (variant) {
      case 'primary':
        return palette.onBrandTeal;
      case 'secondary':
        return palette.onBrandGold;
      case 'danger':
        return palette.onDanger;
      case 'outline':
      case 'ghost':
        return palette.brandTeal;
    }
  })();

  const spinnerColor = (() => {
    if (variant === 'outline' || variant === 'ghost') {
      return palette.brandTeal;
    }
    if (variant === 'secondary') return palette.onBrandGold;
    if (variant === 'danger') return palette.onDanger;
    return palette.onBrandTeal;
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
      testID={testID}
      className={`min-h-touch rounded-lg items-center justify-center px-lg ${styles.container} ${disabled ? 'opacity-50' : ''} ${className}`}
      style={containerStyle}
      onPress={handlePress}
      disabled={disabled || loading}
      accessibilityLabel={title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={spinnerColor} />
      ) : (
        <AppText
          className={`font-semibold text-body ${styles.text}`}
          style={{ color: textColor }}
        >
          {title}
        </AppText>
      )}
    </Pressable>
  );
}
