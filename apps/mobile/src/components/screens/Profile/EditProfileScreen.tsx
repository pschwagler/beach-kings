import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  type TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  formatLocation,
  type PlayerGender,
  type SkillLevel,
} from '@beach-kings/shared';
import { Button, Input } from '@/components/ui';
import TopNav from '@/components/ui/TopNav';
import SectionError from '@/components/home/SectionError';
import {
  BottomSheetSelect,
  CityAutocomplete,
  DateOfBirthField,
  FormError,
  FormLabel,
  type CitySuggestion,
  type SelectOption,
} from '@/components/forms';
import { locationQueries } from '@/features/locations';
import {
  usePlayerProfileMutations,
  type NativeImageFile,
} from '@/features/player';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import {
  birthdayDisplayToIso,
  profileEditSchema,
  type ProfileEditFormValues,
} from '@/lib/validators';
import {
  useLocationAutoSelect,
  type LocationWithDistance,
} from '@/lib/useLocationAutoSelect';
import { getApiErrorMessage } from '@/lib/apiError';
import ProfilePhotoEditor from './ProfilePhotoEditor';
import {
  buildLocationSearchText,
  formatLocationLabel,
  GENDER_SELECT_OPTIONS,
  isoBirthdayToDisplay,
  PREFERRED_SIDE_SELECT_OPTIONS,
  SKILL_LEVEL_SELECT_OPTIONS,
} from './profileFormOptions';

const EMPTY_FORM: ProfileEditFormValues = {
  firstName: '',
  lastName: '',
  nickname: '',
  gender: undefined as unknown as PlayerGender,
  level: undefined as unknown as SkillLevel,
  city: '',
  locationId: '',
  dateOfBirth: '',
  height: '',
  preferredSide: '',
};

function defaultsFromPlayer(
  player: NonNullable<ReturnType<typeof useCurrentPlayer>['data']>,
): ProfileEditFormValues {
  const nameParts = (player.full_name ?? player.name ?? '').trim().split(/\s+/);
  return {
    firstName: player.first_name ?? nameParts[0] ?? '',
    lastName: player.last_name ?? nameParts.slice(1).join(' '),
    nickname: player.nickname ?? '',
    gender: player.gender as ProfileEditFormValues['gender'],
    level: player.level as ProfileEditFormValues['level'],
    city: formatLocation(player.city, player.state) ?? '',
    locationId: player.location_id ?? '',
    dateOfBirth: isoBirthdayToDisplay(player.date_of_birth),
    height: player.height ?? '',
    preferredSide:
      (player.preferred_side as ProfileEditFormValues['preferredSide']) ?? '',
  };
}

export default function EditProfileScreen(): React.ReactNode {
  const router = useRouter();
  const playerQuery = useCurrentPlayer();
  const locationsQuery = useQuery(locationQueries.all());
  const { updateProfile, uploadAvatar, deleteAvatar } =
    usePlayerProfileMutations();
  const [actionError, setActionError] = useState<string | null>(null);
  const selectedCityRef = useRef<CitySuggestion | null>(null);
  const lastNameRef = useRef<TextInput>(null);
  const nicknameRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ProfileEditFormValues>({
    resolver: zodResolver(profileEditSchema),
    mode: 'onSubmit',
    defaultValues: EMPTY_FORM,
  });

  useEffect(() => {
    if (playerQuery.data != null && !isDirty) {
      reset(defaultsFromPlayer(playerQuery.data));
    }
  }, [isDirty, playerQuery.data, reset]);

  const setLocationId = useCallback((locationId: string) => {
    setValue('locationId', locationId, {
      shouldDirty: true,
      shouldValidate: true,
    });
  }, [setValue]);

  const locations = locationsQuery.data ?? [];
  const { locationsWithDistance, handleCitySelect } = useLocationAutoSelect({
    locations,
    onLocationSelect: setLocationId,
  });
  const locationOptions = useMemo<readonly SelectOption[]>(
    () => locationsWithDistance.map((location) => ({
      value: location.id,
      label: formatLocationLabel(location),
      sublabel: location.name
        ? `${location.city}, ${location.state}`
        : undefined,
      searchText: buildLocationSearchText(location),
    })),
    [locationsWithDistance],
  );

  const onCityPicked = useCallback((suggestion: CitySuggestion) => {
    selectedCityRef.current = suggestion;
    setValue('city', suggestion.formatted, {
      shouldDirty: true,
      shouldValidate: true,
    });
    void handleCitySelect({ lat: suggestion.lat, lon: suggestion.lon });
  }, [handleCitySelect, setValue]);

  const submit = useCallback(async (values: ProfileEditFormValues) => {
    setActionError(null);
    const typedCity = values.city.trim();
    const city =
      selectedCityRef.current?.formatted === typedCity
        ? selectedCityRef.current.city
        : (typedCity.split(',')[0]?.trim() ?? typedCity);
    const location = locationsWithDistance.find(
      (item: LocationWithDistance) => item.id === values.locationId,
    );

    try {
      await updateProfile.mutateAsync({
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        full_name: `${values.firstName.trim()} ${values.lastName.trim()}`,
        nickname: values.nickname.trim() || null,
        gender: values.gender as PlayerGender,
        level: values.level as SkillLevel,
        city,
        state: location?.state ?? playerQuery.data?.state ?? null,
        location_id: values.locationId,
        date_of_birth: values.dateOfBirth.trim()
          ? birthdayDisplayToIso(values.dateOfBirth.trim())
          : null,
        height: values.height.trim() || null,
        preferred_side: values.preferredSide || null,
      });
      router.back();
    } catch (error) {
      setActionError(getApiErrorMessage(
        error,
        'Your profile could not be saved. Please try again.',
      ));
    }
  }, [
    locationsWithDistance,
    playerQuery.data?.state,
    router,
    updateProfile,
  ]);

  const handlePhotoUpload = useCallback(async (file: NativeImageFile) => {
    setActionError(null);
    try {
      await uploadAvatar.mutateAsync(file);
    } catch (error) {
      setActionError(getApiErrorMessage(
        error,
        'Your profile photo could not be uploaded. Please try again.',
      ));
    }
  }, [uploadAvatar]);

  const handlePhotoDelete = useCallback(async () => {
    setActionError(null);
    try {
      await deleteAvatar.mutateAsync();
    } catch (error) {
      setActionError(getApiErrorMessage(
        error,
        'Your profile photo could not be removed. Please try again.',
      ));
    }
  }, [deleteAvatar]);

  const isPhotoBusy = uploadAvatar.isPending || deleteAvatar.isPending;

  if (playerQuery.isPending && playerQuery.data == null) {
    return (
      <SafeAreaView className="flex-1 bg-page" edges={['top']}>
        <TopNav title="Edit Profile" showBack />
        <View className="flex-1 items-center justify-center">
          <Text className="text-body text-muted">Loading profile…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (playerQuery.data == null) {
    return (
      <SafeAreaView className="flex-1 bg-page" edges={['top']}>
        <TopNav title="Edit Profile" showBack />
        <View className="px-lg pt-lg">
          <SectionError
            message="Your profile could not be loaded."
            onRetry={() => { void playerQuery.refetch(); }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Edit Profile" showBack />
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-lg pb-xxxl"
          keyboardShouldPersistTaps="handled"
        >
          <ProfilePhotoEditor
            player={playerQuery.data}
            busy={isPhotoBusy}
            onUpload={handlePhotoUpload}
            onDelete={handlePhotoDelete}
            onError={setActionError}
          />

          {actionError != null ? (
            <View className="mb-md">
              <SectionError message={actionError} />
            </View>
          ) : null}

          <View className="flex-row gap-sm">
            <View className="flex-1">
              <FormLabel required>First Name</FormLabel>
              <Controller
                control={control}
                name="firstName"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="First name"
                    autoCapitalize="words"
                    autoComplete="given-name"
                    returnKeyType="next"
                    onSubmitEditing={() => lastNameRef.current?.focus()}
                    blurOnSubmit={false}
                    testID="edit-profile-first-name"
                  />
                )}
              />
              <FormError message={errors.firstName?.message} />
            </View>
            <View className="flex-1">
              <FormLabel required>Last Name</FormLabel>
              <Controller
                control={control}
                name="lastName"
                render={({ field: { value, onChange, onBlur } }) => (
                  <Input
                    ref={lastNameRef}
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder="Last name"
                    autoCapitalize="words"
                    autoComplete="family-name"
                    returnKeyType="next"
                    onSubmitEditing={() => nicknameRef.current?.focus()}
                    blurOnSubmit={false}
                    testID="edit-profile-last-name"
                  />
                )}
              />
              <FormError message={errors.lastName?.message} />
            </View>
          </View>

          <FormLabel className="mt-md">Nickname</FormLabel>
          <Controller
            control={control}
            name="nickname"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                ref={nicknameRef}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Nickname"
                autoCapitalize="words"
                autoComplete="nickname"
                testID="edit-profile-nickname"
              />
            )}
          />

          <FormLabel required className="mt-md">Gender</FormLabel>
          <Controller
            control={control}
            name="gender"
            render={({ field: { value, onChange } }) => (
              <BottomSheetSelect
                title="Select gender"
                placeholder="Select gender"
                options={GENDER_SELECT_OPTIONS}
                value={value ?? ''}
                onChange={onChange}
                error={errors.gender != null}
                testID="edit-profile-gender"
              />
            )}
          />
          <FormError message={errors.gender?.message} />

          <FormLabel className="mt-md">Date of Birth</FormLabel>
          <Controller
            control={control}
            name="dateOfBirth"
            render={({ field: { value, onChange } }) => (
              <DateOfBirthField
                value={value}
                onChange={onChange}
                error={errors.dateOfBirth != null}
                testID="edit-profile-date-of-birth"
              />
            )}
          />
          <FormError message={errors.dateOfBirth?.message} />

          <FormLabel className="mt-md">Height</FormLabel>
          <Controller
            control={control}
            name="height"
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                placeholder="Height (for example, 5 ft 10 in)"
                testID="edit-profile-height"
              />
            )}
          />

          <FormLabel required className="mt-md">Skill Level</FormLabel>
          <Controller
            control={control}
            name="level"
            render={({ field: { value, onChange } }) => (
              <BottomSheetSelect
                title="Select skill level"
                placeholder="Select skill level"
                options={SKILL_LEVEL_SELECT_OPTIONS}
                value={value ?? ''}
                onChange={onChange}
                error={errors.level != null}
                testID="edit-profile-level"
              />
            )}
          />
          <FormError message={errors.level?.message} />

          <FormLabel required className="mt-md">City</FormLabel>
          <Controller
            control={control}
            name="city"
            render={({ field: { value, onChange, onBlur } }) => (
              <CityAutocomplete
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                onCitySelect={onCityPicked}
                error={errors.city != null}
                testID="edit-profile-city"
              />
            )}
          />
          <FormError message={errors.city?.message} />

          <FormLabel required className="mt-md">Location</FormLabel>
          {locationsQuery.isError ? (
            <View className="mb-sm">
              <SectionError
                message="Locations could not be loaded."
                onRetry={() => { void locationsQuery.refetch(); }}
              />
            </View>
          ) : null}
          <Controller
            control={control}
            name="locationId"
            render={({ field: { value, onChange } }) => (
              <BottomSheetSelect
                title="Select location"
                placeholder={
                  locationsQuery.isPending
                    ? 'Loading locations…'
                    : 'Select location'
                }
                options={locationOptions}
                value={value}
                onChange={onChange}
                disabled={locationsQuery.isPending}
                loading={locationsQuery.isPending}
                error={errors.locationId != null}
                emptyMessage={
                  locationsQuery.isError
                    ? 'Locations could not be loaded. Close and try again.'
                    : 'No locations found.'
                }
                searchable
                searchPlaceholder="Search city or state"
                testID="edit-profile-location"
              />
            )}
          />
          <FormError message={errors.locationId?.message} />

          <FormLabel className="mt-md">Preferred Side</FormLabel>
          <Controller
            control={control}
            name="preferredSide"
            render={({ field: { value, onChange } }) => (
              <BottomSheetSelect
                title="Preferred side"
                placeholder="Select preferred side"
                options={PREFERRED_SIDE_SELECT_OPTIONS}
                value={value}
                onChange={onChange}
                testID="edit-profile-preferred-side"
              />
            )}
          />

          <View className="mt-xl">
            <Button
              title="Save Changes"
              onPress={handleSubmit(submit)}
              loading={updateProfile.isPending}
              disabled={isPhotoBusy}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
