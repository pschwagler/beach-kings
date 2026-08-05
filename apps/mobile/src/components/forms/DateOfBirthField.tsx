/**
 * Date-of-birth field: MM/DD/YYYY masked text input with a calendar button
 * that opens the platform-native date picker.
 *
 * Form state (value / onChange) is the display string: '' while empty,
 * partial digits while typing (e.g. '01/15'), or 'MM/DD/YYYY' when full.
 * Semantic validation (valid calendar date, age, etc.) happens in the
 * form schema, so the field surfaces whatever the user has typed and
 * lets zod produce user-visible errors.
 */

import React, { forwardRef, useCallback, useMemo, useState } from 'react';
import { View, TextInput, Pressable, Platform, Modal } from 'react-native';
import AppText from '@/components/ui/AppText';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarIcon } from '@/components/ui/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

interface DateOfBirthFieldProps {
  readonly value: string;
  readonly onChange: (displayValue: string) => void;
  readonly error?: boolean;
  readonly testID?: string;
}

const DISPLAY_PLACEHOLDER = 'MM/DD/YYYY';

function maskInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function displayToDate(display: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;
  const [, m, d, y] = match;
  const month = Number(m);
  const day = Number(d);
  const year = Number(y);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function dateToDisplay(date: Date): string {
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  const y = date.getFullYear().toString().padStart(4, '0');
  return `${m}/${d}/${y}`;
}

const DateOfBirthField = forwardRef<TextInput, DateOfBirthFieldProps>(
  function DateOfBirthField({ value, onChange, error = false, testID }, ref) {
    const { isDark } = useTheme();
    const palette = usePaletteColors();
    const reduceMotion = useReducedMotion();
    const [pickerOpen, setPickerOpen] = useState(false);

    const maximumDate = useMemo(() => new Date(), []);
    const minimumDate = useMemo(() => new Date(1900, 0, 1), []);

    const handleTextChange = useCallback(
      (raw: string) => {
        onChange(maskInput(raw));
      },
      [onChange],
    );

    const openPicker = useCallback(() => setPickerOpen(true), []);
    const closePicker = useCallback(() => setPickerOpen(false), []);

    const handlePickerChange = useCallback(
      (event: DateTimePickerEvent, date?: Date) => {
        if (Platform.OS === 'android') {
          setPickerOpen(false);
          if (event.type === 'set' && date) {
            onChange(dateToDisplay(date));
          }
          return;
        }
        if (date) {
          onChange(dateToDisplay(date));
        }
      },
      [onChange],
    );

    const selectedDate = useMemo(() => {
      const parsed = displayToDate(value);
      if (parsed) return parsed;
      const fallback = new Date();
      fallback.setFullYear(fallback.getFullYear() - 25);
      return fallback;
    }, [value]);

    const borderClass = error ? 'border-danger' : 'border-divider';

    return (
      <>
        <View
          className={`h-12 flex-row items-center rounded-lg border bg-surface ${borderClass}`}
        >
          <TextInput
            ref={ref}
            className="flex-1 px-md"
            value={value}
            onChangeText={handleTextChange}
            placeholder={DISPLAY_PLACEHOLDER}
            placeholderTextColor={palette.textTertiary}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            style={{
              color: palette.textDefault,
              fontSize: 15,
              paddingVertical: 0,
            }}
            keyboardType="number-pad"
            returnKeyType="done"
            maxLength={10}
            accessibilityLabel="Date of birth"
            testID={testID}
          />
          <Pressable
            onPress={openPicker}
            className="h-full w-12 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Open date picker"
            testID={testID ? `${testID}-picker-button` : undefined}
            hitSlop={8}
          >
            <CalendarIcon size={20} color={palette.textMuted} />
          </Pressable>
        </View>

        {pickerOpen && Platform.OS === 'android' ? (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="default"
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            onChange={handlePickerChange}
          />
        ) : null}

        {Platform.OS === 'ios' ? (
          <Modal
            visible={pickerOpen}
            transparent
            animationType={reduceMotion ? 'none' : 'fade'}
            onRequestClose={closePicker}
          >
            <Pressable
              className="flex-1 bg-black/50 justify-end"
              onPress={closePicker}
            >
              <Pressable
                className="bg-surface rounded-t-2xl pb-xl"
                onPress={(e) => e.stopPropagation()}
              >
                <View className="flex-row justify-end px-lg pt-md">
                  <Pressable onPress={closePicker} hitSlop={8}>
                    <AppText className="text-body font-semibold text-brand-teal">
                      Done
                    </AppText>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display="spinner"
                  maximumDate={maximumDate}
                  minimumDate={minimumDate}
                  onChange={handlePickerChange}
                  themeVariant={isDark ? 'dark' : 'light'}
                />
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </>
    );
  },
);

export default DateOfBirthField;
