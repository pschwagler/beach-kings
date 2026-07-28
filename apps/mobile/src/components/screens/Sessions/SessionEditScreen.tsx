/** Form for editing an existing session. */

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
import SessionDateField from './SessionDateField';
import { useSessionEditScreen } from './useSessionEditScreen';

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
      <Text className="text-[14px] font-semibold text-muted w-[100px]">{label}</Text>
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
  readonly sessionId: number;
}

export default function SessionEditScreen({ sessionId }: Props): React.ReactNode {
  const palette = usePaletteColors();
  const {
    session,
    date,
    startTime,
    courtId,
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
    onSave,
    onCancel,
  } = useSessionEditScreen(sessionId);
  const isLeagueSession =
    session?.league_id != null || session?.session_type === 'league';
  const leagueLabel = session?.league_name ?? 'League session';

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']} testID="session-edit-screen">
      <TopNav
        title="Edit Session"
        leftAction={(
          <TouchableOpacity
            onPress={onCancel}
            testID="session-edit-close-btn"
            accessibilityRole="button"
            accessibilityLabel="Close edit session"
            className="min-h-touch min-w-touch items-center justify-center"
          >
            <Text className="text-[18px] font-semibold text-inverse">✕</Text>
          </TouchableOpacity>
        )}
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
          <Text className="text-[15px] font-bold text-default mt-[20px] mb-[4px]">Date &amp; Time</Text>
          <View className="mt-2 overflow-hidden rounded-[14px] border border-divider bg-surface">
            <SessionDateField
              value={date}
              onChange={setDate}
              testID="edit-session-date-input"
            />
            <View className="mx-4 h-px bg-divider" />
            <FormRow label="Start time" value={startTime} onChangeText={setStartTime} placeholder="e.g. 3:00 PM" testID="edit-session-time-input" />
          </View>

          <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Location</Text>
          <SessionCourtPicker
            selectedCourtId={courtId}
            selectedCourtName={session?.court_name}
            onChange={setCourtId}
            testIDPrefix="edit-session"
          />

          {isLeagueSession && (
            <>
              <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">League</Text>
              <View className="py-[14px] border-b border-divider">
                <Text testID="edit-session-league-label" className="text-[14px] text-default">
                  {leagueLabel}
                </Text>
              </View>
            </>
          )}

          {showsSeasonAssignment && (
            <>
              <Text className="text-[15px] font-bold text-default mt-[24px] mb-[4px]">Season</Text>
              <SessionSeasonSelector
                seasons={leagueSeasons}
                selectedSeasonId={selectedSeasonId}
                onChange={setSelectedSeasonId}
                testIDPrefix="edit-session"
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
              testID="edit-session-ranked-toggle"
              value={isRanked}
              onValueChange={setIsRanked}
              disabled={isRankedLocked}
              accessibilityLabel="Ranked games"
            />
          </View>

          {submitError != null && (
            <Text testID="session-edit-error" className="text-[13px] text-danger mt-[12px] text-center">
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[12px] pb-[34px] gap-[8px]">
          <TouchableOpacity
            testID="session-edit-save-btn"
            onPress={() => { void onSave(); }}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Save session changes"
            accessibilityState={{ disabled: isSubmitting, busy: isSubmitting }}
            className="bg-brand-teal rounded-[8px] items-center justify-center py-[16px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color={palette.textInverse} testID="session-edit-loading" />
            ) : (
              <Text className="text-white text-[16px] font-bold">Save Changes</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            testID="session-edit-cancel-btn"
            onPress={onCancel}
            accessibilityRole="button"
            accessibilityLabel="Cancel editing session"
            className="border border-divider bg-elevated rounded-[8px] items-center justify-center py-[14px]"
          >
            <Text className="text-[15px] font-semibold text-muted">Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
