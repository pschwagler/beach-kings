import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View, type GestureResponderEvent } from 'react-native';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { formatLocalCalendarDate, parseCalendarDate } from '@/lib/calendarDate';
import { getApiResponseErrorMessage } from '@/lib/apiError';
import InlineDateNavigationGuard from './InlineDateNavigationGuard';
import SessionDateField from './SessionDateField';

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

/** First reveal the shared date row; its sheet confirms a date-only write. */
export default forwardRef<InlineSessionDateHandle, Props>(function InlineSessionDate({
  sessionId, date, sessionNumber, canEdit, onSave,
}, ref): React.ReactNode {
  const palette = usePaletteColors();
  const bounds = useRef<View>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(date);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(date);
  const pickerOpen = useRef(false);
  const errorRef = useRef<string | null>(null);
  const editingRef = useRef(false);
  const savingRef = useRef(false);
  const generation = useRef(0);
  const rectangle = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    generation.current += 1;
    editingRef.current = false;
    savingRef.current = false;
    rectangle.current = null;
    pickerOpen.current = false;
    errorRef.current = null;
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
    pickerOpen.current = false;
    errorRef.current = null;
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
    errorRef.current = null;
    setError(null);
    try {
      const saved = await onSave(formatLocalCalendarDate(selected));
      if (revision !== generation.current) return;
      if (saved) close();
      else {
        errorRef.current = 'Date editing is no longer available. Refresh and try again.';
        setError(errorRef.current);
      }
    } catch (failure) {
      if (revision === generation.current) {
        errorRef.current = getApiResponseErrorMessage(failure,
          'Could not save the date. Check your connection and try again.');
        setError(errorRef.current);
      }
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
      // Modal events belong to the shared picker, not the screen responder.
      if (pickerOpen.current) return false;
      // Consume the first outside touch without firing an underlying action.
      // Rejected drafts stay visible until explicit Retry or Cancel.
      if (savingRef.current || rectangle.current == null) return true;
      const { pageX, pageY } = event.nativeEvent;
      const { x, y, width, height } = rectangle.current;
      if (pageX >= x && pageX <= x + width && pageY >= y && pageY <= y + height) return false;
      if (errorRef.current == null) close();
      return true;
    },
  }));

  const fieldRevision = generation.current;
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
            pickerOpen.current = false;
            errorRef.current = null;
            draftRef.current = date;
            setDraft(date);
            setError(null);
            editingRef.current = true;
            setEditing(true);
          }}
          className={canEdit ? 'min-h-touch justify-center active:opacity-70' : ''}
        >
          <AppText className="text-[20px] font-bold text-default">{label}</AppText>
        </Pressable>
      ) : (
        <View className="rounded-card border border-divider bg-surface" testID="session-date-inline">
          <InlineDateNavigationGuard onDismiss={() => {
            if (!pickerOpen.current && !savingRef.current && errorRef.current == null) close();
          }} />
          <SessionDateField
            key={`${sessionId}:${canEdit}`}
            testID="session-date-field"
            value={draft}
            disabled={pending}
            onPickerOpenChange={(open) => {
              if (fieldRevision === generation.current) pickerOpen.current = open;
            }}
            onChange={(value) => {
              if (fieldRevision !== generation.current || !editingRef.current) return;
              draftRef.current = value;
              setDraft(value);
              void save(value);
            }}
          />
          {pending && <View className="flex-row items-center gap-2 px-4 pb-3">
            <ActivityIndicator size="small" color={palette.brandTeal} />
            <AppText className="text-[13px] text-muted" accessibilityLiveRegion="polite">Saving date…</AppText>
          </View>}
          {error != null && <View className="px-4 pb-3">
            <AppText testID="session-date-error" accessibilityRole="alert" className="text-[13px] text-danger">{error}</AppText>
            <View className="flex-row justify-end gap-3 mt-2">
              <Pressable testID="session-date-cancel" accessibilityRole="button" accessibilityLabel="Cancel date edit"
                disabled={pending} onPress={close} className="min-h-touch min-w-touch items-center justify-center">
                <AppText className="text-[14px] font-semibold text-muted">Cancel</AppText>
              </Pressable>
              <Pressable testID="session-date-retry" accessibilityRole="button" accessibilityLabel="Retry session date"
                disabled={pending} onPress={() => { void save(); }} className="min-h-touch min-w-touch items-center justify-center">
                <AppText className="text-[15px] font-bold text-brand-teal">Retry</AppText>
              </Pressable>
            </View>
          </View>}
        </View>
      )}
    </View>
  );
});
