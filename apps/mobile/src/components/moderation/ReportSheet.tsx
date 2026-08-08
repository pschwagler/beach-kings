import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, TextInput, View } from 'react-native';
import type { ReportReason, ReportTargetType } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import { useModerationMutations } from '@/features/moderation';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
}

export default function ReportSheet({ targetType, targetId, onClose, onSubmitted }: Props) {
  const palette = usePaletteColors();
  const { report } = useModerationMutations();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (reason == null) return;
    setError(null);
    try {
      await report.mutateAsync({
        target_type: targetType,
        target_id: targetId,
        reason,
        ...(details.trim() ? { details: details.trim() } : {}),
      });
      onSubmitted?.();
      onClose();
    } catch (cause) {
      const duplicate = (cause as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      setError(duplicate ?? 'Could not submit this report. Please try again.');
    }
  };

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <View className="absolute inset-0 bg-nav/80 justify-end" accessibilityViewIsModal>
      <Pressable className="flex-1" onPress={onClose} accessibilityLabel="Close report" />
      <View className="bg-elevated rounded-t-3xl px-lg pt-lg pb-2xl">
        <AppText accessibilityRole="header" className="text-xl font-bold text-default">Report</AppText>
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
          placeholder="Add details (optional)"
          placeholderTextColor={palette.textMuted}
          multiline
          maxLength={1000}
          className="min-h-[88px] mt-md rounded-xl border border-divider bg-surface px-md py-sm text-default"
          accessibilityLabel="Report details"
        />
        <AppText className="text-xs text-muted text-right mt-xs">{details.length}/1000</AppText>
        {error != null && <AppText className="text-sm text-danger mt-sm" accessibilityRole="alert">{error}</AppText>}
        <Pressable
          onPress={() => { void submit(); }}
          disabled={reason == null || report.isPending}
          accessibilityRole="button"
          accessibilityState={{ disabled: reason == null || report.isPending }}
          className={`min-h-touch rounded-xl items-center justify-center mt-md ${reason == null ? 'bg-inset' : 'bg-brand-gold'}`}
        >
          {report.isPending ? <ActivityIndicator color={palette.textDefault} /> : <AppText className="font-bold text-on-brand-gold">Submit report</AppText>}
        </Pressable>
      </View>
    </View>
    </Modal>
  );
}
