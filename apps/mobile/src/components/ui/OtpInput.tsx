/**
 * OtpInput — row of individual TextInput cells for one-time passwords.
 * Auto-advances on input, backspace navigates back, paste fills all cells.
 * Each cell is 44x48 with a border; focused cell gets teal border.
 */

import React, { useRef, useState } from 'react';
import { View, TextInput, NativeSyntheticEvent, TextInputKeyPressEventData } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';

interface OtpInputProps {
  readonly length?: number;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly className?: string;
}

export default function OtpInput({
  length = 6,
  value,
  onChange,
  className = '',
}: OtpInputProps): React.ReactNode {
  const { isDark } = useTheme();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const cells = Array.from({ length }, (_, i) => value[i] ?? '');

  const handleChangeText = (text: string, index: number) => {
    // Paste: fill all cells from pasted string
    if (text.length > 1) {
      const digits = text.replace(/\D/g, '').slice(0, length);
      onChange(digits.padEnd(value.length > digits.length ? value.length : 0, '').slice(0, length) === '' ? digits : digits);
      const nextFocus = Math.min(digits.length, length - 1);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const digit = text.replace(/\D/g, '');
    const next = value.split('');
    next[index] = digit;
    const updated = next.join('').slice(0, length);
    onChange(updated);

    if (digit && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (
    e: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (e.nativeEvent.key === 'Backspace' && !cells[index] && index > 0) {
      const next = value.split('');
      next[index - 1] = '';
      onChange(next.join(''));
      inputRefs.current[index - 1]?.focus();
    }
  };

  const textColor = isDark ? darkColors.textPrimary : colors.textPrimary;

  return (
    <View className={`flex-row gap-2 ${className}`}>
      {cells.map((cell, index) => {
        const isFocused = focusedIndex === index;
        return (
          <TextInput
            key={index}
            ref={(ref) => { inputRefs.current[index] = ref; }}
            value={cell}
            onChangeText={(text) => handleChangeText(text, index)}
            onKeyPress={(e) => handleKeyPress(e, index)}
            onFocus={() => setFocusedIndex(index)}
            onBlur={() => setFocusedIndex(null)}
            keyboardType="number-pad"
            maxLength={1}
            selectTextOnFocus
            className={`w-11 h-12 border-2 rounded-lg text-center text-xl font-semibold bg-white dark:bg-elevated ${
              isFocused
                ? 'border-primary dark:border-brand-teal'
                : 'border-border dark:border-border-strong'
            }`}
            style={{ color: textColor }}
            accessibilityLabel={`OTP digit ${index + 1}`}
          />
        );
      })}
    </View>
  );
}
