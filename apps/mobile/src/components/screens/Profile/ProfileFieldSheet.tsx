import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { Player } from '@beach-kings/shared';
import { spacing } from '@beach-kings/shared/tokens';
import { BottomSheet, Button, Input } from '@/components/ui';
import AppText from '@/components/ui/AppText';
import {
  BottomSheetSelect,
  CityAutocomplete,
  FormError,
  FormLabel,
  type CitySuggestion,
  type SelectOption,
} from '@/components/forms';
import { locationQueries } from '@/features/locations';
import { useLocationAutoSelect } from '@/lib/useLocationAutoSelect';
import {
  buildLocationSearchText,
  formatLocationLabel,
  GENDER_SELECT_OPTIONS,
  PREFERRED_SIDE_SELECT_OPTIONS,
  SKILL_LEVEL_SELECT_OPTIONS,
} from './profileFormOptions';
import {
  buildProfileEditorPayload,
  PROFILE_EDITOR_TITLES,
  profileDraftFromPlayer,
  type ProfileEditorDraft,
  type ProfileEditorKey,
  validateProfileEditor,
} from './profileEditorModel';

interface ProfileFieldSheetProps {
  readonly editor: ProfileEditorKey | null;
  readonly player: Player;
  readonly saving: boolean;
  readonly onClose: () => void;
  readonly onSave: (updates: Partial<Player>) => Promise<void>;
}

export default function ProfileFieldSheet({
  editor,
  player,
  saving,
  onClose,
  onSave,
}: ProfileFieldSheetProps): React.ReactNode {
  const locationsQuery = useQuery({
    ...locationQueries.all(),
    enabled: editor === 'location',
  });
  const initialDraft = useMemo(() => profileDraftFromPlayer(player), [player]);
  const [draft, setDraft] = useState<ProfileEditorDraft>(initialDraft);
  const [baseline, setBaseline] = useState<ProfileEditorDraft>(initialDraft);
  const [error, setError] = useState<string | null>(null);
  const initializedEditorRef = useRef<ProfileEditorKey | null>(null);

  useEffect(() => {
    if (editor == null) {
      initializedEditorRef.current = null;
    } else if (initializedEditorRef.current !== editor) {
      const next = profileDraftFromPlayer(player);
      setDraft(next);
      setBaseline(next);
      setError(null);
      initializedEditorRef.current = editor;
    }
  }, [editor, player]);

  const setField = useCallback(
    <K extends keyof ProfileEditorDraft>(key: K, value: ProfileEditorDraft[K]) => {
      setDraft((current) => ({ ...current, [key]: value }));
      setError(null);
    },
    [],
  );

  const setLocationId = useCallback(
    (locationId: string) => setField('locationId', locationId),
    [setField],
  );
  const locations = locationsQuery.data ?? [];
  const { locationsWithDistance, handleCitySelect } = useLocationAutoSelect({
    locations,
    onLocationSelect: setLocationId,
  });
  const locationOptions = useMemo<readonly SelectOption[]>(
    () =>
      locationsWithDistance.map((location) => ({
        value: String(location.id),
        label: formatLocationLabel(location),
        sublabel: location.name
          ? `${location.city ?? ''}, ${location.state ?? ''}`
          : undefined,
        searchText: buildLocationSearchText(location),
      })),
    [locationsWithDistance],
  );

  const isDirty = JSON.stringify(draft) !== JSON.stringify(baseline);
  const requestClose = useCallback(() => {
    if (saving) return;
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert('Discard changes?', 'Your unsaved changes will be lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onClose },
    ]);
  }, [isDirty, onClose, saving]);

  const save = useCallback(async () => {
    if (editor == null) return;
    const validationError = validateProfileEditor(editor, draft);
    if (validationError != null) {
      setError(validationError);
      return;
    }
    try {
      await onSave(
        buildProfileEditorPayload(editor, draft, locationsWithDistance),
      );
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Your profile could not be saved. Please try again.',
      );
    }
  }, [draft, editor, locationsWithDistance, onClose, onSave]);

  const onCityPicked = useCallback(
    (suggestion: CitySuggestion) => {
      setField('city', suggestion.formatted);
      void handleCitySelect({ lat: suggestion.lat, lon: suggestion.lon });
    },
    [handleCitySelect, setField],
  );

  return (
    <BottomSheet
      visible={editor != null}
      onClose={requestClose}
      className="max-h-[88%]"
    >
      {editor != null ? (
        <>
          <View className="flex-row items-center justify-between px-lg pb-sm">
            <AppText family="display" weight="bold" className="text-title3 text-default">
              {PROFILE_EDITOR_TITLES[editor]}
            </AppText>
            <Button title="Cancel" variant="ghost" onPress={requestClose} disabled={saving} />
          </View>
          <ScrollView
            testID="profile-editor-scroll"
            style={{ flexShrink: 1 }}
            keyboardShouldPersistTaps="always"
            contentContainerStyle={{
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xl,
            }}
          >
            <EditorFields
              editor={editor}
              draft={draft}
              setField={setField}
              locationsPending={locationsQuery.isPending}
              locationOptions={locationOptions}
              onCityPicked={onCityPicked}
            />
            <FormError message={error ?? undefined} />
            <Button
              title="Save"
              onPress={() => { void save(); }}
              loading={saving}
              disabled={!isDirty}
              className="mt-lg"
              testID={`profile-editor-${editor}-save`}
            />
          </ScrollView>
        </>
      ) : null}
    </BottomSheet>
  );
}

interface EditorFieldsProps {
  readonly editor: ProfileEditorKey;
  readonly draft: ProfileEditorDraft;
  readonly setField: <K extends keyof ProfileEditorDraft>(
    key: K,
    value: ProfileEditorDraft[K],
  ) => void;
  readonly locationsPending: boolean;
  readonly locationOptions: readonly SelectOption[];
  readonly onCityPicked: (suggestion: CitySuggestion) => void;
}

function EditorFields({
  editor,
  draft,
  setField,
  locationsPending,
  locationOptions,
  onCityPicked,
}: EditorFieldsProps): React.ReactNode {
  switch (editor) {
    case 'name':
      return (
        <View className="gap-md">
          <View>
            <FormLabel required>First Name</FormLabel>
            <Input value={draft.firstName} onChangeText={(v) => setField('firstName', v)} placeholder="First name" autoCapitalize="words" testID="profile-editor-first-name" />
          </View>
          <View>
            <FormLabel required>Last Name</FormLabel>
            <Input value={draft.lastName} onChangeText={(v) => setField('lastName', v)} placeholder="Last name" autoCapitalize="words" testID="profile-editor-last-name" />
          </View>
        </View>
      );
    case 'nickname':
      return <Input value={draft.nickname} onChangeText={(v) => setField('nickname', v)} placeholder="Nickname" autoCapitalize="words" testID="profile-editor-nickname" />;
    case 'gender':
      return <BottomSheetSelect title="Select gender" placeholder="Select gender" options={GENDER_SELECT_OPTIONS} value={draft.gender} onChange={(v) => setField('gender', v)} testID="profile-editor-gender" />;
    case 'height':
      return (
        <View>
          <Input value={draft.height} onChangeText={(v) => setField('height', v)} placeholder="Enter height" testID="profile-editor-height" />
          <AppText className="text-caption text-muted mt-xs">
            Use feet and inches (for example, 5 ft 10 in) or meters (for example, 1.78 m).
          </AppText>
        </View>
      );
    case 'level':
      return <BottomSheetSelect title="Select skill level" placeholder="Select skill level" options={SKILL_LEVEL_SELECT_OPTIONS} value={draft.level} onChange={(v) => setField('level', v)} testID="profile-editor-level" />;
    case 'location':
      return (
        <View className="gap-md">
          <View>
            <FormLabel required>City</FormLabel>
            <CityAutocomplete value={draft.city} onChangeText={(v) => setField('city', v)} onCitySelect={onCityPicked} testID="profile-editor-city" />
          </View>
          <View>
            <FormLabel required>League Location</FormLabel>
            <BottomSheetSelect title="Select league location" placeholder={locationsPending ? 'Loading locations…' : 'Select location'} options={locationOptions} value={draft.locationId} onChange={(v) => setField('locationId', v)} disabled={locationsPending} loading={locationsPending} searchable searchPlaceholder="Search city or state" testID="profile-editor-location" />
          </View>
        </View>
      );
    case 'preferredSide':
      return <BottomSheetSelect title="Preferred side" placeholder="Select preferred side" options={[{ value: '', label: 'Not set' }, ...PREFERRED_SIDE_SELECT_OPTIONS]} value={draft.preferredSide} onChange={(v) => setField('preferredSide', v)} testID="profile-editor-preferred-side" />;
  }
}
