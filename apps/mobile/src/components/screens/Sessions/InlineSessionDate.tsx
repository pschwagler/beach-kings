import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, View, type GestureResponderEvent } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useTheme } from '@/contexts/ThemeContext';
import { formatCalendarDateLabel, formatLocalCalendarDate, parseCalendarDate } from '@/lib/calendarDate';
import { getApiResponseErrorMessage } from '@/lib/apiError';
import InlineDateNavigationGuard from './InlineDateNavigationGuard';

export interface InlineSessionDateHandle {
  readonly handleOutsideTouch: (event: GestureResponderEvent) => boolean;
  readonly refreshBounds: () => void;
}

interface Props {
  readonly sessionId: number;
  readonly date: string;
  readonly sessionNumber: number;
  readonly canEdit: boolean;
  readonly onSave: (date: string) => Promise<boolean>;
}

/** Expands in place. A changed draft is committed once on Done or an outside touch. */
export default forwardRef<InlineSessionDateHandle, Props>(function InlineSessionDate({
  sessionId, date, sessionNumber, canEdit, onSave,
}, ref): React.ReactNode {
  const palette = usePaletteColors();
  const { isDark } = useTheme();
  const bounds = useRef<View>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(date);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(date);
  const editingRef = useRef(false);
  const savingRef = useRef(false);
  const generation = useRef(0);
  const rectangle = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    generation.current += 1;
    editingRef.current = false;
    savingRef.current = false;
    rectangle.current = null;
    setEditing(false);
    setPending(false);
    setError(null);
    return () => { generation.current += 1; };
  }, [sessionId, canEdit]);

  const close = (): void => {
    generation.current += 1;
    editingRef.current = false;
    savingRef.current = false;
    rectangle.current = null;
    setEditing(false);
    setPending(false);
    setError(null);
  };
  const save = async (value = draftRef.current): Promise<void> => {
    if (!editingRef.current || savingRef.current || !canEdit) return;
    const selected = parseCalendarDate(value);
    const current = parseCalendarDate(date);
    if (value === date || (selected != null && current != null && selected.getTime() === current.getTime())) {
      close();
      return;
    }
    if (selected == null) {
      setError('Choose a valid session date.');
      return;
    }
    const revision = generation.current;
    savingRef.current = true;
    setPending(true);
    setError(null);
    try {
      const saved = await onSave(formatLocalCalendarDate(selected));
      if (revision !== generation.current) return;
      if (saved) close();
      else setError('Date editing is no longer available. Refresh and try again.');
    } catch (failure) {
      if (revision === generation.current) setError(getApiResponseErrorMessage(failure,
        'Could not save the date. Check your connection and try Done again.'));
    } finally {
      if (revision === generation.current) {
        savingRef.current = false;
        setPending(false);
      }
    }
  };

  const refreshBounds = (): void => {
    if (!editingRef.current) return;
    const revision = generation.current;
    bounds.current?.measureInWindow((x, y, width, height) => {
      if (generation.current === revision && editingRef.current && width > 0 && height > 0) {
        rectangle.current = { x, y, width, height };
      }
    });
  };

  useImperativeHandle(ref, () => ({
    refreshBounds,
    handleOutsideTouch: (event) => {
      if (!editingRef.current) return false;
      // The first outside touch saves/dismisses; it must not also navigate
      // away and hide a rejected draft. Pending writes consume all touches.
      if (savingRef.current || rectangle.current == null) return true;
      const { pageX, pageY } = event.nativeEvent;
      const { x, y, width, height } = rectangle.current;
      if (pageX >= x && pageX <= x + width && pageY >= y && pageY <= y + height) return false;
      void save();
      return true;
    },
  }));

  const selectedDate = parseCalendarDate(draft) ?? new Date();
  const persistedDate = parseCalendarDate(date);
  const label = `${persistedDate?.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric' }) ?? date} · Session #${sessionNumber}`;

  return (
    <View ref={bounds} collapsable={false} testID="session-date-editor" onLayout={refreshBounds}>
      {!editing ? (
        <Pressable
          testID="session-date-label"
          disabled={!canEdit}
          accessible={canEdit}
          accessibilityRole={canEdit ? 'button' : undefined}
          accessibilityLabel={canEdit ? `Edit session date, ${label}` : undefined}
          accessibilityHint={canEdit ? 'Opens the calendar here' : undefined}
          onPress={() => {
            generation.current += 1;
            rectangle.current = null;
            savingRef.current = false;
            draftRef.current = date;
            setDraft(date);
            setError(null);
            editingRef.current = true;
            setEditing(true);
          }}
          className={canEdit ? 'min-h-touch justify-center active:opacity-70' : ''}
        >
          <AppText className="text-[20px] font-bold text-default">{label}</AppText>
          {canEdit && <AppText className="text-[12px] font-semibold text-brand-teal mt-1">Edit date</AppText>}
        </Pressable>
      ) : (
        <View className="rounded-card border border-divider bg-surface p-3" testID="session-date-inline">
          <InlineDateNavigationGuard onDismiss={() => { void save(); }} />
          <View className="flex-row items-center justify-between gap-2">
            <AppText className="flex-1 text-[15px] font-bold text-default">Session date · #{sessionNumber}</AppText>
            <Pressable testID="session-date-cancel" accessibilityRole="button" accessibilityLabel="Cancel date edit"
              disabled={pending} onPress={close} className="min-h-touch min-w-touch items-center justify-center">
              <AppText className="text-[14px] font-semibold text-muted">Cancel</AppText>
            </Pressable>
            <Pressable testID="session-date-done" accessibilityRole="button" accessibilityLabel="Save session date"
              disabled={pending} accessibilityState={{ disabled: pending, busy: pending }}
              onPress={() => { void save(); }} className="min-h-touch min-w-touch items-center justify-center">
              <AppText className="text-[15px] font-bold text-brand-teal">Done</AppText>
            </Pressable>
          </View>
          <AppText className="text-[13px] text-muted mb-2">{formatCalendarDateLabel(draft)}</AppText>
          {!pending && <DateTimePicker
            testID="session-date-inline-picker"
            value={selectedDate} mode="date" display={Platform.OS === 'ios' ? 'inline' : 'default'}
            themeVariant={isDark ? 'dark' : 'light'} accentColor={palette.brandTeal}
            onChange={(event, next) => {
              if (Platform.OS === 'android' && event.type !== 'set') { close(); return; }
              if (next == null) return;
              const nextValue = formatLocalCalendarDate(next);
              draftRef.current = nextValue;
              setDraft(nextValue);
              if (Platform.OS === 'android') void save(nextValue);
            }}
          />}
          {pending ? <View className="flex-row items-center gap-2 py-3">
            <ActivityIndicator size="small" color={palette.brandTeal} />
            <AppText className="text-[13px] text-muted" accessibilityLiveRegion="polite">Saving date…</AppText>
          </View> : <AppText className="text-[12px] text-muted">Tap outside or Done to save.</AppText>}
          {error != null && <AppText testID="session-date-error" accessibilityRole="alert" className="text-[13px] text-danger mt-2">{error}</AppText>}
        </View>
      )}
    </View>
  );
});
