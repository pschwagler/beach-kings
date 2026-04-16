/**
 * Themed TextInput with dark mode support.
 * Handles placeholderTextColor, keyboardAppearance, and typed text color
 * via useTheme() — these require JS, not just Tailwind dark: classes.
 */

import React from 'react';
import { TextInput, TextInputProps } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';

interface InputProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly placeholder?: string;
  readonly secureTextEntry?: boolean;
  readonly keyboardType?: TextInputProps['keyboardType'];
  readonly autoCapitalize?: TextInputProps['autoCapitalize'];
  readonly autoComplete?: TextInputProps['autoComplete'];
  readonly className?: string;
}

export default function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  autoComplete,
  className = '',
}: InputProps): React.ReactNode {
  const { isDark } = useTheme();

  return (
    <TextInput
      className={`h-12 border border-border dark:border-border-strong rounded-lg px-md text-body bg-white dark:bg-elevated ${className}`}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={isDark ? darkColors.textTertiary : colors.textTertiary}
      keyboardAppearance={isDark ? 'dark' : 'light'}
      style={{ color: isDark ? darkColors.textPrimary : colors.textPrimary }}
      secureTextEntry={secureTextEntry}
      keyboardType={keyboardType}
      autoCapitalize={autoCapitalize}
      autoComplete={autoComplete}
      accessibilityLabel={placeholder}
    />
  );
}
