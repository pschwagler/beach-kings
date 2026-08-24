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
import { useQuery } from '@tanstack/react-query';
import BottomSheetSelect from '@/components/forms/BottomSheetSelect';
import { locationQueries } from '@/features/locations';
import { formatLocationLabel } from '@/components/screens/Profile/profileFormOptions';
import SectionError from '@/components/home/SectionError';

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
    courtName,
    courtConfirmed,
    needsMetro,
    isSavingMetro,
    metroError,
    courtSuggestionError,
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
    confirmCourt,
    saveMetro,
    retryCourtSuggestion,
    setSelectedSeasonId,
    setIsRanked,
    onSubmit,
  } = useSessionCreateScreen({ leagueId, seasonId, playerIds });
  const locationsQuery = useQuery({
    ...locationQueries.all(),
    enabled: needsMetro,
  });
  const locationOptions = (locationsQuery.data ?? []).map((location) => ({
    value: location.id,
    label: formatLocationLabel(location),
  }));
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
          {needsMetro ? (
            <View className="mt-2 rounded-card bg-surface px-md py-md gap-sm">
              <AppText className="text-body font-semibold text-default">
                Choose your metro
              </AppText>
              <AppText className="text-sm text-muted">
                We use a named metro to offer an Other / Private Court option. No exact location is saved.
              </AppText>
              <BottomSheetSelect
                title="Select metro"
                placeholder={locationsQuery.isPending ? 'Loading metros…' : 'Select metro'}
                options={locationOptions}
                value=""
                onChange={(locationId) => {
                  const location = locationsQuery.data?.find((item) => item.id === locationId);
                  if (location != null) void saveMetro(location);
                }}
                disabled={locationsQuery.isPending || isSavingMetro}
                loading={locationsQuery.isPending || isSavingMetro}
                searchable
                searchPlaceholder="Search metros"
                testID="session-metro-picker"
              />
              {locationsQuery.isError && (
                <SectionError
                  message="Available metros could not be loaded."
                  onRetry={() => { void locationsQuery.refetch(); }}
                />
              )}
              {metroError != null && (
                <AppText accessibilityRole="alert" className="text-sm text-danger">
                  {metroError}
                </AppText>
              )}
            </View>
          ) : (
            <>
              <SessionCourtPicker
                selectedCourtId={courtId}
                selectedCourtName={courtName}
                onChange={setCourtId}
                testIDPrefix="session"
                allowNone={false}
                useProfileCoordinates={false}
              />
              {courtId != null && !courtConfirmed ? (
                <View className="mt-sm rounded-card bg-info-tint px-md py-md gap-sm">
                  <AppText className="text-sm text-default">
                    Confirm this court before starting the session.
                  </AppText>
                  <TouchableOpacity
                    testID="session-confirm-court"
                    onPress={confirmCourt}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm ${courtName ?? 'suggested court'}`}
                    className="min-h-touch rounded-button bg-brand-teal items-center justify-center px-md"
                  >
                    <AppText className="text-sm font-semibold text-on-brand">Confirm Court</AppText>
                  </TouchableOpacity>
                </View>
              ) : courtConfirmed ? (
                <AppText testID="session-court-confirmed" className="mt-xs text-sm text-success">
                  Court confirmed
                </AppText>
              ) : null}
              {courtSuggestionError != null && (
                <View className="mt-sm">
                  <SectionError
                    message={courtSuggestionError}
                    onRetry={() => { void retryCourtSuggestion(); }}
                  />
                </View>
              )}
            </>
          )}

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
