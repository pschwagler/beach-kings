/**
 * OtpInput — row of individual TextInput cells for one-time passwords.
 * Auto-advances on input, backspace navigates back, paste fills all cells.
 * Each cell is 44x48 with a border; focused cell gets teal border.
 *
 * First cell advertises textContentType="oneTimeCode" + autoComplete="sms-otp"
 * so iOS SMS autofill and Android SMS Retriever can populate the whole code.
 * When the code reaches full length, onComplete (if provided) fires once so
 * callers can auto-submit.
 *
 * shakeKey: increment this value to trigger an error-shake animation. The
 * initial value (0) does not animate — only subsequent increments do.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  TextInput,
  View,
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { colors, darkColors } from '@beach-kings/shared/tokens';

interface OtpInputProps {
  readonly length?: number;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  readonly className?: string;
  /**
   * Increment this value to trigger a horizontal shake animation indicating
   * an error. The initial value (0) does not animate.
   */
  readonly shakeKey?: number;
}

/** Horizontal offset sequence for the shake animation (in points). */
const SHAKE_SEQUENCE = [0, -8, 8, -6, 6, -4, 4, 0];
/** Duration of each step in the shake sequence (ms). */
const SHAKE_STEP_MS = 50;

export default function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  className = '',
  shakeKey = 0,
}: OtpInputProps): React.ReactNode {
  const { isDark } = useTheme();
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const completedRef = useRef(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const cells = Array.from({ length }, (_, i) => value[i] ?? '');

  // Fire onComplete exactly once per full-length entry.
  useEffect(() => {
    if (value.length === length && !completedRef.current) {
      completedRef.current = true;
      onComplete?.(value);
    } else if (value.length < length) {
      completedRef.current = false;
    }
  }, [value, length, onComplete]);

  // Trigger shake when shakeKey increments (skip initial render where it is 0).
  useEffect(() => {
    if (shakeKey === 0) return;

    const steps = SHAKE_SEQUENCE.map((toValue) =>
      Animated.timing(shakeAnim, {
        toValue,
        duration: SHAKE_STEP_MS,
        useNativeDriver: true,
      }),
    );

    Animated.sequence(steps).start();
  }, [shakeKey, shakeAnim]);

  const handleChangeText = (text: string, index: number) => {
    if (text.length > 1) {
      // Handle paste: extract digits, fill all cells, focus the right cell.
      const digits = text.replace(/\D/g, '').slice(0, length);
      onChange(digits);
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
    <Animated.View
      className={`flex-row gap-2 ${className}`}
      style={{ transform: [{ translateX: shakeAnim }] }}
    >
      {cells.map((cell, index) => {
        const isFocused = focusedIndex === index;
        const isFirst = index === 0;
        const isLast = index === length - 1;
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
            maxLength={isFirst ? length : 1}
            textContentType={isFirst ? 'oneTimeCode' : 'none'}
            autoComplete={isFirst ? 'sms-otp' : 'off'}
            selectTextOnFocus
            returnKeyType={isLast ? 'done' : 'next'}
            onSubmitEditing={isLast ? Keyboard.dismiss : undefined}
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
    </Animated.View>
  );
}
