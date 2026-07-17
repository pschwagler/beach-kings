/** Form for starting a pickup or league-connected session. */

import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { usePaletteColors } from '@/theme/usePaletteColors';
import SessionCourtPicker from './SessionCourtPicker';
import SessionSeasonSelector from './SessionSeasonSelector';
import { useSessionCreateScreen } from './useSessionCreateScreen';

interface FormRowProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder: string;
  readonly testID: string;
}

function FormRow({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
}: FormRowProps): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="flex-row items-center py-[14px] border-b border-divider">
      <Text className="text-[14px] font-semibold text-muted w-[100px]">{label}</Text>
      <TextInput
        className="flex-1 text-[14px] text-default"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textTertiary}
        testID={testID}
      />
    </View>
  );
}

interface Props {
  readonly leagueId?: number | null;
  readonly seasonId?: number | null;
}

export default function SessionCreateScreen({ leagueId, seasonId }: Props): React.ReactNode {
  const palette = usePaletteColors();
  const {
    date,
    startTime,
    courtId,
    leagueName,
    leagueSeasons,
    selectedSeasonId,
    showsSeasonAssignment,
    isRanked,
    isRankedLocked,
    isSubmitting,
    submitError,
    setDate,
    setStartTime,
    setCourtId,
    setSelectedSeasonId,
    setIsRanked,
    onSubmit,
  } = useSessionCreateScreen({ leagueId, seasonId });
  const contextLabel = leagueId != null ? leagueName ?? 'League session' : 'Pickup session';

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']} testID="session-create-screen">
      <TopNav title="Start Session" showBack />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text className="text-[15px] font-bold text-default mt-[20px] mb-[4px]">Date &amp; Time</Text>
          <FormRow label="Date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" testID="session-date-input" />
          <FormRow label="Start Time" value={startTime} onChangeText={setStartTime} placeholder="e.g. 3:00 PM" testID="session-time-input" />

          <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Location</Text>
          <SessionCourtPicker
            selectedCourtId={courtId}
            onChange={setCourtId}
            testIDPrefix="session"
          />

          <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Session</Text>
          <View className="py-[14px] border-b border-divider">
            <Text className="text-[14px] font-semibold text-muted">Context</Text>
            <Text testID="session-context-label" className="text-[14px] text-default mt-[2px]">
              {contextLabel}
            </Text>
          </View>

          {showsSeasonAssignment && (
            <>
              <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Season</Text>
              <SessionSeasonSelector
                seasons={leagueSeasons}
                selectedSeasonId={selectedSeasonId}
                onChange={setSelectedSeasonId}
                testIDPrefix="session-create"
              />
            </>
          )}

          <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Rankings</Text>
          <View className="flex-row items-center justify-between py-[14px] border-b border-divider">
            <View className="flex-1 pr-[12px]">
              <Text className="text-[14px] font-semibold text-muted">
                {isRanked ? 'Ranked' : 'Casual'}
              </Text>
              <Text className="text-[12px] text-muted mt-[2px]">
                {isRanked
                  ? 'Games affect player rankings'
                  : 'Games do not affect player rankings'}
              </Text>
            </View>
            <Switch
              testID="session-ranked-toggle"
              value={isRanked}
              onValueChange={setIsRanked}
              disabled={isRankedLocked}
              accessibilityLabel="Ranked games"
            />
          </View>

          {submitError != null && (
            <Text testID="session-create-error" className="text-[13px] text-danger mt-[12px] text-center">
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[12px] pb-[34px]">
          <TouchableOpacity testID="session-create-submit-btn" onPress={onSubmit} disabled={isSubmitting} className="bg-brand-gold rounded-[8px] items-center justify-center py-[16px]">
            {isSubmitting ? (
              <ActivityIndicator color={palette.textInverse} testID="session-create-loading" />
            ) : (
              <Text className="text-white text-[16px] font-bold">Start Session</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
