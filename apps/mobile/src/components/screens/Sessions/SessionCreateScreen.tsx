/** Form for starting a pickup or league-connected session. */

import React from 'react';
import AppText from '@/components/ui/AppText';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { usePaletteColors } from '@/theme/usePaletteColors';
import AppSwitch from '@/components/ui/AppSwitch';
import SessionCourtPicker from './SessionCourtPicker';
import SessionSeasonSelector from './SessionSeasonSelector';
import SessionDateField from './SessionDateField';
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
    <View className="min-h-[64px] flex-row items-center px-4">
      <AppText className="text-[14px] font-semibold text-muted w-[100px]">{label}</AppText>
      <TextInput
        className="flex-1 text-[14px] text-default"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={palette.textTertiary}
        testID={testID}
        accessibilityLabel={label}
      />
    </View>
  );
}

interface Props {
  readonly leagueId?: number | null;
  readonly seasonId?: number | null;
  readonly playerIds?: readonly number[];
}

export default function SessionCreateScreen({
  leagueId,
  seasonId,
  playerIds,
}: Props): React.ReactNode {
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
  } = useSessionCreateScreen({ leagueId, seasonId, playerIds });
  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']} testID="session-create-screen">
      <TopNav title="Start Session" showBack />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <AppText className="text-[15px] font-bold text-default mt-[20px] mb-[4px]">Date &amp; Time</AppText>
          <View className="mt-2 overflow-hidden rounded-[14px] border border-divider bg-surface">
            <SessionDateField
              value={date}
              onChange={setDate}
              testID="session-date-input"
            />
            <View className="mx-4 h-px bg-divider" />
            <FormRow label="Start time" value={startTime} onChangeText={setStartTime} placeholder="e.g. 3:00 PM" testID="session-time-input" />
          </View>

          <AppText className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Location</AppText>
          <SessionCourtPicker
            selectedCourtId={courtId}
            onChange={setCourtId}
            testIDPrefix="session"
            allowNone={false}
            selectDefaultCourt
          />

          {leagueId != null && (
            <>
              <AppText className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">League</AppText>
              <View className="py-[14px] border-b border-divider">
                <AppText testID="session-league-label" className="text-[14px] text-default">
                  {leagueName ?? 'League session'}
                </AppText>
              </View>
            </>
          )}

          {showsSeasonAssignment && (
            <>
              <AppText className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Season</AppText>
              <SessionSeasonSelector
                seasons={leagueSeasons}
                selectedSeasonId={selectedSeasonId}
                onChange={setSelectedSeasonId}
                testIDPrefix="session-create"
              />
            </>
          )}

          <AppText className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Rankings</AppText>
          <View className="flex-row items-center justify-between py-[14px] border-b border-divider">
            <View className="flex-1 pr-[12px]">
              <AppText className="text-[14px] font-semibold text-muted">
                {isRanked ? 'Ranked' : 'Casual'}
              </AppText>
              <AppText className="text-[12px] text-muted mt-[2px]">
                {isRanked
                  ? 'Games affect player rankings'
                  : 'Games do not affect player rankings'}
              </AppText>
            </View>
            <AppSwitch
              testID="session-ranked-toggle"
              value={isRanked}
              onValueChange={setIsRanked}
              disabled={isRankedLocked}
              accessibilityLabel="Ranked games"
            />
          </View>

          {submitError != null && (
            <AppText testID="session-create-error" className="text-[13px] text-danger mt-[12px] text-center">
              {submitError}
            </AppText>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[12px] pb-[34px]">
          <TouchableOpacity
            testID="session-create-submit-btn"
            onPress={onSubmit}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Start session"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            className="bg-brand-gold rounded-[8px] items-center justify-center py-[16px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color={palette.onBrandGold} testID="session-create-loading" />
            ) : (
              <AppText className="text-on-brand-gold text-[16px] font-bold">Start Session</AppText>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
