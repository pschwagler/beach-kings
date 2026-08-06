import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, type MapPressEvent, type MarkerDragStartEndEvent } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import type {
  CourtEditChanges,
  CourtSandDepth,
  CourtWindExposure,
} from '@beach-kings/shared';

import AppSwitch from '@/components/ui/AppSwitch';
import AppText from '@/components/ui/AppText';
import Button from '@/components/ui/Button';
import TopNav from '@/components/ui/TopNav';
import { useCourtSuggestionMutation } from '@/features/courts';
import { getApiErrorMessage } from '@/lib/apiError';
import { openHttpUrl } from '@/lib/externalUrls';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { singlePinRegion, type LatLng } from '@/utils/mapRegion';
import CourtDetailErrorState from './CourtDetailErrorState';
import CourtDetailSkeleton from './CourtDetailSkeleton';
import { useCourtDetailScreen } from './useCourtDetailScreen';

type NullableChoice<T extends string> = T | null;

const WIND_OPTIONS: ReadonlyArray<{ label: string; value: NullableChoice<CourtWindExposure> }> = [
  { label: 'Sheltered', value: 'sheltered' },
  { label: 'Mixed', value: 'mixed' },
  { label: 'Exposed', value: 'exposed' },
  { label: 'Not sure', value: null },
];
const SAND_OPTIONS: ReadonlyArray<{ label: string; value: NullableChoice<CourtSandDepth> }> = [
  { label: 'Shallow', value: 'shallow' },
  { label: 'Typical', value: 'typical' },
  { label: 'Deep', value: 'deep' },
  { label: 'Not sure', value: null },
];

function ChoiceRow<T extends string>({
  label,
  value,
  options,
  onChange,
  testID,
}: {
  readonly label: string;
  readonly value: NullableChoice<T>;
  readonly options: ReadonlyArray<{ label: string; value: NullableChoice<T> }>;
  readonly onChange: (value: NullableChoice<T>) => void;
  readonly testID: string;
}): React.ReactNode {
  return (
    <View className="mb-4">
      <AppText className="mb-2 text-[14px] font-semibold text-default">{label}</AppText>
      <View className="flex-row flex-wrap gap-2">
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.label}
              testID={`${testID}-${option.value ?? 'unknown'}`}
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              className={`min-h-touch justify-center rounded-full border px-4 ${
                selected ? 'border-brand-teal bg-info-tint' : 'border-divider bg-surface'
              }`}
            >
              <AppText className={selected ? 'font-semibold text-brand-teal' : 'text-muted'}>
                {option.label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function NotesInput({
  label,
  value,
  onChangeText,
  maxLength,
  testID,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly maxLength: number;
  readonly testID: string;
}): React.ReactNode {
  const palette = usePaletteColors();
  return (
    <View className="mb-4">
      <View className="mb-2 flex-row justify-between">
        <AppText className="text-[14px] font-semibold text-default">{label}</AppText>
        <AppText className="text-[12px] text-tertiary">{value.length}/{maxLength}</AppText>
      </View>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        maxLength={maxLength}
        multiline
        placeholder="Optional details players should know"
        placeholderTextColor={palette.textTertiary}
        className="min-h-[84px] rounded-xl border border-divider bg-surface px-3 py-3 text-[14px] text-default"
        style={{ textAlignVertical: 'top' }}
      />
    </View>
  );
}

interface Props {
  readonly idOrSlug: number | string;
}

export default function SuggestCourtEditScreen({ idOrSlug }: Props): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();
  const { court, isLoading, error, onRetry } = useCourtDetailScreen(idOrSlug);
  const suggestion = useCourtSuggestionMutation();
  const [windExposure, setWindExposure] = useState<NullableChoice<CourtWindExposure> | undefined>();
  const [windNotes, setWindNotes] = useState<string | undefined>();
  const [sandDepth, setSandDepth] = useState<NullableChoice<CourtSandDepth> | undefined>();
  const [sandNotes, setSandNotes] = useState<string | undefined>();
  const [website, setWebsite] = useState<string | undefined>();
  const [note, setNote] = useState('');
  const [correctPin, setCorrectPin] = useState(false);
  const [proposedPin, setProposedPin] = useState<LatLng | null>(null);

  const currentPin = useMemo<LatLng | null>(() => {
    if (court?.latitude == null || court.longitude == null) return null;
    return { latitude: court.latitude, longitude: court.longitude };
  }, [court?.latitude, court?.longitude]);
  const pin = proposedPin ?? currentPin;

  if (isLoading) {
    return <SafeAreaView className="flex-1 bg-page" edges={['top']}><TopNav title="Suggest an Edit" showBack /><CourtDetailSkeleton /></SafeAreaView>;
  }
  if (error != null || court == null) {
    return <SafeAreaView className="flex-1 bg-page" edges={['top']}><TopNav title="Suggest an Edit" showBack /><CourtDetailErrorState onRetry={onRetry} /></SafeAreaView>;
  }

  const selectedWind = windExposure === undefined ? (court.wind_exposure ?? null) : windExposure;
  const selectedSand = sandDepth === undefined ? (court.sand_depth ?? null) : sandDepth;
  const displayedWindNotes = windNotes ?? court.wind_notes ?? '';
  const displayedSandNotes = sandNotes ?? court.sand_notes ?? '';
  const displayedWebsite = website ?? court.website ?? '';

  const updatePin = (coordinate: LatLng): void => {
    setProposedPin({ latitude: coordinate.latitude, longitude: coordinate.longitude });
  };

  const togglePinCorrection = (enabled: boolean): void => {
    setCorrectPin(enabled);
    if (enabled && currentPin != null) updatePin(currentPin);
  };

  const submit = (): void => {
    const changes: CourtEditChanges = {};
    if (selectedWind !== (court.wind_exposure ?? null)) changes.wind_exposure = selectedWind;
    if (displayedWindNotes.trim() !== (court.wind_notes ?? '')) changes.wind_notes = displayedWindNotes.trim() || null;
    if (selectedSand !== (court.sand_depth ?? null)) changes.sand_depth = selectedSand;
    if (displayedSandNotes.trim() !== (court.sand_notes ?? '')) changes.sand_notes = displayedSandNotes.trim() || null;
    if (displayedWebsite.trim() !== (court.website ?? '')) changes.website = displayedWebsite.trim() || null;
    if (correctPin) {
      const latitude = proposedPin?.latitude;
      const longitude = proposedPin?.longitude;
      if (
        latitude == null
        || longitude == null
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || latitude < -90
        || latitude > 90
        || longitude < -180
        || longitude > 180
      ) {
        Alert.alert('Check the proposed pin', 'Choose a valid location on the map.');
        return;
      }
      if (currentPin == null || latitude !== currentPin.latitude || longitude !== currentPin.longitude) {
        changes.latitude = latitude;
        changes.longitude = longitude;
      }
    }
    if (Object.keys(changes).length === 0) {
      Alert.alert('No changes yet', 'Update at least one field before submitting.');
      return;
    }
    const courtId = Number(court.id);
    if (!Number.isInteger(courtId) || courtId <= 0) {
      Alert.alert('Unable to submit', 'This court does not have a valid numeric ID.');
      return;
    }
    suggestion.mutate(
      { courtId, changes, note: note.trim() || undefined },
      {
        onSuccess: () => Alert.alert(
          'Suggestion submitted',
          'Thanks for helping players. An admin will review your changes before they appear.',
          [{ text: 'Done', onPress: () => router.back() }],
        ),
        onError: (mutationError) => Alert.alert(
          'Could not submit',
          getApiErrorMessage(mutationError, 'Please try again.'),
        ),
      },
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']} testID="suggest-court-edit-screen">
      <TopNav title="Suggest an Edit" showBack />
      <KeyboardAvoidingView className="flex-1" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
          <AppText className="text-[20px] font-bold text-default">{court.name}</AppText>
          <AppText className="mb-5 mt-1 text-[13px] leading-5 text-muted">
            Share what you observed. Suggestions are reviewed by an admin before updating the court.
          </AppText>

          <AppText className="mb-3 text-[16px] font-bold text-default">Playing Conditions</AppText>
          <View className="rounded-2xl border border-divider bg-surface p-4">
            <ChoiceRow label="Wind exposure" value={selectedWind} options={WIND_OPTIONS} onChange={setWindExposure} testID="wind-exposure" />
            <NotesInput label="Wind notes" value={displayedWindNotes} onChangeText={setWindNotes} maxLength={140} testID="wind-notes-input" />
            <ChoiceRow label="Sand depth" value={selectedSand} options={SAND_OPTIONS} onChange={setSandDepth} testID="sand-depth" />
            <NotesInput label="Sand notes" value={displayedSandNotes} onChangeText={setSandNotes} maxLength={140} testID="sand-notes-input" />
          </View>

          <AppText className="mb-3 mt-6 text-[16px] font-bold text-default">Plan Your Visit</AppText>
          <View className="rounded-2xl border border-divider bg-surface p-4">
            <AppText className="mb-2 text-[14px] font-semibold text-default">Official site / booking</AppText>
            <TextInput
              testID="court-website-input"
              accessibilityLabel="Official site or booking URL"
              value={displayedWebsite}
              onChangeText={setWebsite}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="https://parks.example.gov/court"
              placeholderTextColor={palette.textTertiary}
              className="min-h-touch rounded-xl border border-divider bg-page px-3 text-[14px] text-default"
            />
            {court.website != null && court.website.length > 0 && (
              <Pressable onPress={() => { void openHttpUrl(court.website!); }} className="min-h-touch justify-center" accessibilityRole="link">
                <AppText className="text-[13px] font-semibold text-brand-teal">Open current official site / booking ↗</AppText>
              </Pressable>
            )}
          </View>

          <View className="mt-6 rounded-2xl border border-divider bg-surface p-4">
            <View className="flex-row items-center justify-between gap-4">
              <View className="flex-1">
                <AppText className="text-[15px] font-bold text-default">Correct the map pin</AppText>
                <AppText className="mt-1 text-[12px] leading-4 text-muted">Optional. Turn this on only if the current pin is misplaced.</AppText>
              </View>
              <AppSwitch
                testID="pin-correction-switch"
                accessibilityLabel="Correct the map pin"
                value={correctPin}
                onValueChange={togglePinCorrection}
                disabled={currentPin == null}
              />
            </View>
            {currentPin == null && <AppText className="mt-2 text-[12px] text-tertiary">Pin correction needs an existing court location.</AppText>}
            {correctPin && pin != null && (
              <View className="mt-4 overflow-hidden rounded-xl border border-divider" style={{ height: 240 }}>
                <MapView
                  testID="pin-correction-map"
                  style={{ flex: 1 }}
                  initialRegion={singlePinRegion(pin)}
                  onPress={(event: MapPressEvent) => updatePin(event.nativeEvent.coordinate)}
                >
                  {currentPin != null && <Marker coordinate={currentPin} title="Current pin" accessibilityLabel="Current court pin" pinColor={palette.textTertiary} />}
                  <Marker
                    testID="proposed-court-pin"
                    coordinate={pin}
                    title="Proposed pin"
                    accessibilityLabel="Proposed court pin. Drag to adjust."
                    pinColor={palette.brandGold}
                    draggable
                    onDragEnd={(event: MarkerDragStartEndEvent) => updatePin(event.nativeEvent.coordinate)}
                  />
                </MapView>
              </View>
            )}
            {correctPin && <AppText className="mt-2 text-[12px] text-muted">Gray is the current pin; gold is your proposal. Tap the map or drag the gold pin.</AppText>}
          </View>

          <View className="mt-6">
            <NotesInput label="Anything else for the reviewer?" value={note} onChangeText={setNote} maxLength={280} testID="suggestion-note-input" />
          </View>
          <Button title="Submit for Review" onPress={submit} loading={suggestion.isPending} disabled={suggestion.isPending} testID="submit-court-suggestion" />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
