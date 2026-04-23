/**
 * Themed TextInput with dark mode support.
 * Handles placeholderTextColor, keyboardAppearance, and typed text color
 * via useTheme() — these require JS, not just Tailwind dark: classes.
 *
 * Supports keyboard chaining: forwards ref to the underlying TextInput so
 * callers can call .focus() from a previous field's onSubmitEditing.
 *
 * Optional showPasswordToggle prop: when true and secureTextEntry is set,
 * renders an eye icon button that toggles password visibility.
 */

import React, { forwardRef, useState } from 'react';
import { TextInput, TextInputProps, Pressable, View } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';
import { EyeIcon, EyeOffIcon } from '@/components/ui/icons';

interface InputProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onBlur?: () => void;
  readonly placeholder?: string;
  readonly secureTextEntry?: boolean;
  readonly showPasswordToggle?: boolean;
  readonly keyboardType?: TextInputProps['keyboardType'];
  readonly autoCapitalize?: TextInputProps['autoCapitalize'];
  readonly autoComplete?: TextInputProps['autoComplete'];
  readonly className?: string;
  readonly returnKeyType?: TextInputProps['returnKeyType'];
  readonly onSubmitEditing?: TextInputProps['onSubmitEditing'];
  readonly blurOnSubmit?: boolean;
  readonly textContentType?: TextInputProps['textContentType'];
  readonly testID?: string;
}

const Input = forwardRef<TextInput, InputProps>(function Input(
  {
    value,
    onChangeText,
    onBlur,
    placeholder,
    secureTextEntry,
    showPasswordToggle = false,
    keyboardType,
    autoCapitalize,
    autoComplete,
    className = '',
    returnKeyType,
    onSubmitEditing,
    blurOnSubmit,
    textContentType,
    testID,
  },
  ref,
) {
  const { isDark } = useTheme();
  const [passwordVisible, setPasswordVisible] = useState(false);

  const showToggle = showPasswordToggle && secureTextEntry;
  const isSecure = showToggle ? !passwordVisible : secureTextEntry;

  const iconColor = isDark ? darkColors.textTertiary : colors.textTertiary;

  if (!showToggle) {
    return (
      <TextInput
        ref={ref}
        testID={testID}
        className={`h-12 border border-border dark:border-border-strong rounded-lg px-md bg-white dark:bg-elevated ${className}`}
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={isDark ? darkColors.textTertiary : colors.textTertiary}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        style={{
          color: isDark ? darkColors.textPrimary : colors.textPrimary,
          fontSize: 15,
          paddingVertical: 0,
        }}
        secureTextEntry={isSecure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        textContentType={textContentType}
        accessibilityLabel={placeholder}
      />
    );
  }

  return (
    <View
      className={`h-12 border border-border dark:border-border-strong rounded-lg flex-row items-center bg-white dark:bg-elevated ${className}`}
    >
      <TextInput
        ref={ref}
        testID={testID}
        className="flex-1 px-md"
        value={value}
        onChangeText={onChangeText}
        onBlur={onBlur}
        placeholder={placeholder}
        placeholderTextColor={isDark ? darkColors.textTertiary : colors.textTertiary}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        style={{
          color: isDark ? darkColors.textPrimary : colors.textPrimary,
          fontSize: 15,
          paddingVertical: 0,
        }}
        secureTextEntry={isSecure}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        blurOnSubmit={blurOnSubmit}
        textContentType={textContentType}
        accessibilityLabel={placeholder}
      />
      <Pressable
        onPress={() => setPasswordVisible((v) => !v)}
        accessibilityLabel={passwordVisible ? 'Hide password' : 'Show password'}
        accessibilityRole="button"
        hitSlop={8}
        style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingRight: 8 }}
      >
        {passwordVisible ? (
          <EyeOffIcon size={20} color={iconColor} />
        ) : (
          <EyeIcon size={20} color={iconColor} />
        )}
      </Pressable>
    </View>
  );
});

export default Input;
