import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ReportReason, ReportTargetType } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import { getApiResponseErrorMessage } from '@/lib/apiError';
import { useModerationMutations } from '@/features/moderation';
import { usePaletteColors } from '@/theme/usePaletteColors';
import BottomSheet from '@/components/ui/BottomSheet';
import useKeyboard from '@/hooks/useKeyboard';
import { useTheme } from '@/contexts/ThemeContext';
import type { AccessibilityFocusRef } from '@/components/ui/useModalAccessibility';

const REASONS: readonly { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'hate_discrimination', label: 'Hate or discrimination' },
  { value: 'threats_violence', label: 'Threats or violence' },
  { value: 'stalking_doxxing', label: 'Stalking or doxxing' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'sexual_exploitation', label: 'Sexual exploitation' },
  { value: 'minor_safety', label: 'Minor safety' },
  { value: 'self_harm', label: 'Self-harm' },
  { value: 'privacy_impersonation', label: 'Privacy or impersonation' },
  { value: 'spam_scam', label: 'Spam or scam' },
  { value: 'other', label: 'Other' },
];

interface Props {
  readonly targetType: ReportTargetType;
  readonly targetId: number;
  readonly onClose: () => void;
  readonly onSubmitted?: () => void;
  readonly returnFocusRef?: AccessibilityFocusRef;
}

export default function ReportSheet({ targetType, targetId, onClose, onSubmitted, returnFocusRef }: Props) {
  const palette = usePaletteColors();
  const insets = useSafeAreaInsets();
  const submitting = useRef(false);
  const submitted = useRef(false);
  const dismissed = useRef(false);
  const { report } = useModerationMutations();
  const [visible, setVisible] = useState(true);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { isDark } = useTheme();
  const { isVisible: keyboardVisible } = useKeyboard();
  const { fontScale } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const titleRef = useRef<View>(null);
  const detailsFocused = useRef(false);
  const [contentHeight, setContentHeight] = useState(0);
  const [formHeight, setFormHeight] = useState(0);
  const [counterHeight, setCounterHeight] = useState(0);
  // Keep several lines visible; longer drafts scroll inside the native editor.
  // The editor itself must also fit the scrolling viewport at large text sizes.
  const editorLimit = formHeight > 0 ? Math.max(56, formHeight - counterHeight - 28) : 240;
  const detailsHeight = Math.min(Math.max(112, 88 * fontScale, contentHeight), 240, editorLimit);
  const revealDetails = useCallback(() => {
    if (detailsFocused.current) scrollRef.current?.scrollToEnd({ animated: false });
  }, []);
  const close = useCallback(() => {
    setVisible(false);
  }, []);
  const finishDismissal = useCallback(() => {
    if (dismissed.current) return;
    dismissed.current = true;
    onClose();
    if (submitted.current) onSubmitted?.();
  }, [onClose, onSubmitted]);

  useEffect(() => {
    if (keyboardVisible) revealDetails();
  }, [keyboardVisible, revealDetails]);

  const submit = async () => {
    if (reason == null || submitting.current) return;
    submitting.current = true;
    setError(null);
    try {
      await report.mutateAsync({
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      submitted.current = true;
      close();
    } catch (cause) {
      setError(getApiResponseErrorMessage(cause, 'Could not submit this report. Please try again.'));
    } finally {
      submitting.current = false;
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={close}
      onDismiss={finishDismissal}
      testID="report-dialog"
      accessibilityLabel="Report"
      initialFocusRef={titleRef}
      returnFocusRef={returnFocusRef}
      className="bg-elevated"
      style={{ height: '90%', maxHeight: '100%' }}
    >
      {/* Remeasure static controls after an in-place Dynamic Type change. */}
      <View key={`header-${fontScale}`} style={{ flexShrink: 0 }} className="flex-row items-center justify-between px-lg">
        <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel="Report">
          <AppText accessible={false} className="text-xl font-bold text-default">Report</AppText>
        </View>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close report" className="min-h-touch justify-center px-sm">
          <AppText className="text-brand-teal">Close</AppText>
        </Pressable>
      </View>
      <ScrollView
        ref={scrollRef}
        testID="report-form-scroll"
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}
        onLayout={(event) => { setFormHeight(event.nativeEvent.layout.height); revealDetails(); }}
        onContentSizeChange={revealDetails}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets={false}
      >
        <AppText className="text-sm text-muted mt-xs mb-md">Choose the reason that best describes the problem.</AppText>
        <View className="flex-row flex-wrap gap-sm">
          {REASONS.map((item) => (
            <Pressable
              key={item.value}
              onPress={() => setReason(item.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: reason === item.value }}
              className={`min-h-touch justify-center rounded-full px-md border ${reason === item.value ? 'bg-brand-teal border-brand-teal' : 'bg-surface border-divider'}`}
            >
              <AppText className={reason === item.value ? 'text-on-brand-teal' : 'text-default'}>{item.label}</AppText>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={details}
          onChangeText={(text) => setDetails(text.slice(0, 1000))}
          onFocus={() => { detailsFocused.current = true; revealDetails(); }}
          onBlur={() => { detailsFocused.current = false; }}
          onContentSizeChange={(event) => setContentHeight(event.nativeEvent.contentSize.height)}
          placeholder="Add details (optional)"
          placeholderTextColor={palette.textMuted}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          multiline
          submitBehavior="newline"
          textAlignVertical="top"
          scrollEnabled
          maxLength={1000}
          style={{ height: detailsHeight, flexShrink: 0, color: palette.textDefault, fontSize: 16 }}
          className="mt-md rounded-xl border border-divider bg-surface px-md py-sm"
          accessibilityLabel="Report details"
        />
        <AppText key={`counter-${fontScale}`} onLayout={(event) => setCounterHeight(event.nativeEvent.layout.height)} className="text-xs text-muted text-right mt-xs">{details.length}/1000</AppText>
        {error != null && <AppText className="text-sm text-danger mt-sm" accessibilityRole="alert">{error}</AppText>}
      </ScrollView>
      {/* Actions stay in the keyboard-adjusted viewport, outside the form's scroll area. */}
      <View
        key={`actions-${fontScale}`}
        testID="report-actions"
        style={{ flexShrink: 0, paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 16) }}
        className="px-lg pt-sm border-t border-divider"
      >
        {keyboardVisible && (
          <Pressable onPress={Keyboard.dismiss} accessibilityRole="button" accessibilityLabel="Dismiss keyboard" className="min-h-touch justify-center self-end px-sm">
            <AppText className="text-brand-teal">{fontScale > 1.5 ? 'Done' : 'Dismiss keyboard'}</AppText>
          </Pressable>
        )}
        <Pressable
          onPress={() => { void submit(); }}
          disabled={reason == null || report.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: reason == null || report.isPending }}
          className={`min-h-touch rounded-xl items-center justify-center ${reason == null ? 'bg-inset' : 'bg-brand-gold'}`}
        >
          {report.isPending ? <ActivityIndicator color={palette.textDefault} /> : <AppText className="font-bold text-on-brand-gold">Submit report</AppText>}
        </Pressable>
      </View>
    </BottomSheet>
  );
}
