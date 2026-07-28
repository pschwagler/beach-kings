import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { CalendarIcon, ChevronRightIcon } from '@/components/ui/icons';
import { useTheme } from '@/contexts/ThemeContext';
import { usePaletteColors } from '@/theme/usePaletteColors';
import {
  formatCalendarDateLabel,
  formatLocalCalendarDate,
  parseCalendarDate,
} from '@/lib/calendarDate';

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly testID: string;
}

function atLocalNoon(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
}

export default function SessionDateField({
  value,
  onChange,
  testID,
}: Props): React.ReactNode {
  const palette = usePaletteColors();
  const { isDark } = useTheme();
  const today = useMemo(() => atLocalNoon(new Date()), []);
  const selectedDate = useMemo(
    () => parseCalendarDate(value) ?? today,
    [today, value],
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState(selectedDate);

  const openPicker = useCallback(() => {
    setDraftDate(selectedDate);
    setPickerOpen(true);
  }, [selectedDate]);

  const closePicker = useCallback(() => {
    setPickerOpen(false);
  }, []);

  const commitDate = useCallback(
    (date: Date) => {
      onChange(formatLocalCalendarDate(date));
      setPickerOpen(false);
    },
    [onChange],
  );

  const handlePickerChange = useCallback(
    (event: DateTimePickerEvent, nextDate?: Date) => {
      if (Platform.OS === 'android') {
        setPickerOpen(false);
        if (event.type === 'set' && nextDate != null) {
          onChange(formatLocalCalendarDate(nextDate));
        }
        return;
      }
      if (nextDate != null) setDraftDate(atLocalNoon(nextDate));
    },
    [onChange],
  );

  const setQuickDate = useCallback(
    (dayOffset: number) => {
      const next = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() + dayOffset,
        12,
      );
      setDraftDate(next);
    },
    [today],
  );

  return (
    <>
      <TouchableOpacity
        testID={testID}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel="Session date"
        accessibilityValue={{ text: formatCalendarDateLabel(value, today) }}
        className="min-h-[68px] flex-row items-center px-4 active:opacity-75"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-info-tint">
          <CalendarIcon size={19} color={palette.brandTeal} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-[12px] font-semibold text-muted">
            Session date
          </Text>
          <Text className="mt-0.5 text-[15px] font-semibold text-default">
            {formatCalendarDateLabel(value, today)}
          </Text>
        </View>
        <ChevronRightIcon size={18} color={palette.textTertiary} />
      </TouchableOpacity>

      {pickerOpen && Platform.OS === 'android' && (
        <DateTimePicker
          value={draftDate}
          mode="date"
          display="calendar"
          onChange={handlePickerChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={pickerOpen}
          transparent
          animationType="slide"
          onRequestClose={closePicker}
          testID={`${testID}-modal`}
        >
          <View className="flex-1 justify-end">
            <Pressable
              testID={`${testID}-backdrop`}
              accessibilityRole="button"
              accessibilityLabel="Close calendar"
              className="absolute inset-0 bg-black/40"
              onPress={closePicker}
            />
            <View
              testID={`${testID}-sheet`}
              className="rounded-t-[24px] bg-surface px-4 pb-8 pt-2"
            >
              <View className="mb-2 h-1 w-9 self-center rounded-full bg-strong" />
              <View className="min-h-touch flex-row items-center justify-between">
                <TouchableOpacity
                  testID={`${testID}-cancel`}
                  onPress={closePicker}
                  accessibilityRole="button"
                  className="min-h-touch min-w-touch justify-center"
                >
                  <Text className="text-[15px] font-semibold text-muted">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <View className="items-center">
                  <Text className="text-[16px] font-bold text-default">
                    Session date
                  </Text>
                  <Text className="mt-0.5 text-[12px] text-muted">
                    {formatCalendarDateLabel(
                      formatLocalCalendarDate(draftDate),
                      today,
                    )}
                  </Text>
                </View>
                <TouchableOpacity
                  testID={`${testID}-done`}
                  onPress={() => commitDate(draftDate)}
                  accessibilityRole="button"
                  className="min-h-touch min-w-touch items-end justify-center"
                >
                  <Text className="text-[15px] font-bold text-brand-teal">
                    Done
                  </Text>
                </TouchableOpacity>
              </View>

              <View className="mt-1 overflow-hidden rounded-[16px] bg-elevated">
                <DateTimePicker
                  testID={`${testID}-picker`}
                  value={draftDate}
                  mode="date"
                  display="inline"
                  onChange={handlePickerChange}
                  themeVariant={isDark ? 'dark' : 'light'}
                  accentColor={palette.brandTeal}
                />
              </View>

              <View className="mt-3 flex-row gap-2">
                <TouchableOpacity
                  testID={`${testID}-today`}
                  onPress={() => setQuickDate(0)}
                  accessibilityRole="button"
                  accessibilityLabel="Use today's date"
                  className="min-h-touch flex-1 items-center justify-center rounded-[12px] border border-divider bg-elevated active:opacity-75"
                >
                  <Text className="text-[14px] font-semibold text-default">
                    Today
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  testID={`${testID}-tomorrow`}
                  onPress={() => setQuickDate(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Use tomorrow's date"
                  className="min-h-touch flex-1 items-center justify-center rounded-[12px] border border-divider bg-elevated active:opacity-75"
                >
                  <Text className="text-[14px] font-semibold text-default">
                    Tomorrow
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </>
  );
}
