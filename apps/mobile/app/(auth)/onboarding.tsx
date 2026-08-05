import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  type TextInput,
} from 'react-native';
import AppText from '@/components/ui/AppText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/components/ui';
import SectionError from '@/components/home/SectionError';
import { CrownIcon, CheckIcon } from '@/components/ui/icons';
import {
  FormLabel,
  FormError,
  BottomSheetSelect,
  DateOfBirthField,
  CityAutocomplete,
  type SelectOption,
  type CitySuggestion,
} from '@/components/forms';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticSuccess } from '@/utils/haptics';
import {
  onboardingSchema,
  birthdayDisplayToIso,
  type OnboardingFormValues,
} from '@/lib/validators';
import { useLocationAutoSelect } from '@/lib/useLocationAutoSelect';
import type { PlayerGender, SkillLevel, Location } from '@beach-kings/shared';
import {
  buildLocationSearchText,
  formatLocationLabel,
  GENDER_SELECT_OPTIONS,
  SKILL_LEVEL_SELECT_OPTIONS,
} from '@/components/screens/Profile/profileFormOptions';
import { locationQueries } from '@/features/locations';
import { usePaletteColors } from '@/theme/usePaletteColors';

type Screen = 'form' | 'success';

export default function OnboardingScreen(): React.ReactNode {
  const { setProfileComplete } = useAuth();
  const router = useRouter();
  const palette = usePaletteColors();

  const [screen, setScreen] = useState<Screen>('form');
  const locationsQuery = useQuery(locationQueries.all());
  const locations: readonly Location[] = locationsQuery.data ?? [];
  const isLoadingLocations = locationsQuery.isPending;

  const nicknameRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    mode: 'onSubmit',
    defaultValues: {
      gender: undefined,
      level: undefined,
      city: '',
      locationId: '',
      nickname: '',
      dateOfBirth: '',
    },
  });

  const setLocationId = useCallback(
    (id: string) => {
      setValue('locationId', id, { shouldValidate: true, shouldDirty: true });
    },
    [setValue],
  );

  const { locationsWithDistance, handleCitySelect } = useLocationAutoSelect({
    locations,
    onLocationSelect: setLocationId,
  });

  const locationOptions = useMemo<readonly SelectOption[]>(
    () =>
      locationsWithDistance.map((l) => ({
        value: l.id,
        label: formatLocationLabel(l),
        sublabel: l.name ? `${l.city}, ${l.state}` : undefined,
        searchText: buildLocationSearchText(l),
      })),
    [locationsWithDistance],
  );

  // The city field displays the formatted "City, State" label for a good UX,
  // but we must persist the bare city name — the state is stored separately,
  // so submitting the formatted string double-bakes the state into `city`
  // (e.g. "Greenpoint, New York" + state "New York"). Track the last picked
  // suggestion so onSubmit can send its structured `city` instead of the label.
  const selectedCityRef = useRef<CitySuggestion | null>(null);

  const onCityPicked = useCallback(
    (suggestion: CitySuggestion) => {
      selectedCityRef.current = suggestion;
      setValue('city', suggestion.formatted, {
        shouldValidate: true,
        shouldDirty: true,
      });
      handleCitySelect({ lat: suggestion.lat, lon: suggestion.lon });
    },
    [handleCitySelect, setValue],
  );

  const onSubmit = useCallback(
    async (values: OnboardingFormValues) => {
      const location = locationsWithDistance.find(
        (l) => l.id === values.locationId,
      );
      const typedCity = values.city.trim();
      // Prefer the structured city from the picked suggestion (still matching
      // the field) so the state isn't double-baked into `city`. Fall back to
      // the text before the first comma for a manually-typed value.
      const cityName =
        selectedCityRef.current?.formatted === typedCity
          ? selectedCityRef.current.city
          : (typedCity.split(',')[0]?.trim() ?? typedCity);
      try {
        await api.updatePlayerProfile({
          gender: values.gender as PlayerGender,
          level: values.level as SkillLevel,
          location_id: values.locationId,
          city: cityName,
          state: location?.state ?? '',
          ...(values.nickname?.trim()
            ? { nickname: values.nickname.trim() }
            : {}),
          ...(values.dateOfBirth?.trim()
            ? { date_of_birth: birthdayDisplayToIso(values.dateOfBirth.trim()) }
            : {}),
        });
        void hapticSuccess();
        setScreen('success');
      } catch {
        Alert.alert('Error', 'Failed to save profile. Please try again.');
      }
    },
    [locationsWithDistance],
  );

  const handleGetStarted = useCallback(() => {
    setProfileComplete(true);
    router.replace(routes.home());
  }, [router, setProfileComplete]);

  const handleSkip = useCallback(() => {
    setProfileComplete(true);
    router.replace(routes.home());
  }, [router, setProfileComplete]);

  if (screen === 'success') {
    return (
      <SafeAreaView className="flex-1 bg-page">
        <View className="flex-1 items-center justify-center px-lg">
          <View className="bg-surface rounded-2xl px-lg py-xl items-center w-full max-w-md">
            <View
              testID="onboarding-success-check"
              className="w-16 h-16 rounded-full bg-success-tint items-center justify-center mb-md"
            >
              <CheckIcon size={32} color={palette.success} />
            </View>
            <AppText className="text-title3 font-bold text-default text-center mb-xs">
              Profile Complete!
            </AppText>
            <AppText className="text-body text-muted text-center mb-lg">
              You're all set. Find leagues near you, connect with players, and
              start tracking your games.
            </AppText>
            <View className="w-full">
              <Button title="Get Started" onPress={handleGetStarted} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="px-lg pt-lg pb-md">
          <Pressable
            className="absolute right-md top-sm z-10 min-h-touch px-sm items-center justify-center"
            onPress={handleSkip}
            accessibilityRole="link"
            accessibilityLabel="Skip for now"
            hitSlop={8}
          >
            <AppText className="text-footnote font-semibold text-accent">
              Skip for now
            </AppText>
          </Pressable>
          <View className="items-center mb-sm">
            <CrownIcon size={36} color={palette.brandGold} />
          </View>
          <AppText className="text-title3 font-bold text-default text-center mb-xs">
            Complete Your Profile
          </AppText>
          <AppText className="text-footnote text-muted text-center">
            Tell us about yourself so we can match you with the right leagues
            and players.
          </AppText>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-lg pb-lg"
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <AppText className="text-caption font-medium text-danger mb-md">
              * Required fields
            </AppText>

            <FormLabel required>Gender</FormLabel>
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
                  error={!!errors.gender}
                  testID="onboarding-gender-select"
                />
              )}
            />
            <FormError message={errors.gender?.message} />

            <FormLabel required className="mt-md">
              City
            </FormLabel>
            <Controller
              control={control}
              name="city"
              render={({ field: { value, onChange, onBlur } }) => (
                <CityAutocomplete
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  onCitySelect={onCityPicked}
                  error={!!errors.city}
                  testID="onboarding-city"
                />
              )}
            />
            <FormError message={errors.city?.message} />

            <FormLabel required className="mt-md">
              Location
            </FormLabel>
            {locationsQuery.isError ? (
              <View className="mb-sm">
                <SectionError
                  message="Locations could not be loaded."
                  onRetry={() => {
                    void locationsQuery.refetch();
                  }}
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
                    isLoadingLocations
                      ? 'Loading locations…'
                      : 'Select location'
                  }
                  options={locationOptions}
                  value={value}
                  onChange={onChange}
                  disabled={isLoadingLocations}
                  loading={isLoadingLocations}
                  error={!!errors.locationId}
                  emptyMessage={
                    locationsQuery.isError
                      ? 'Locations could not be loaded. Close and try again.'
                      : 'No locations found.'
                  }
                  testID="onboarding-location-select"
                  searchable
                  searchPlaceholder="Search city or state"
                />
              )}
            />
            {errors.locationId ? (
              <FormError message={errors.locationId.message} />
            ) : (
              <AppText className="text-caption text-muted mt-xxs">
                Closest region auto-selected from your city — change if needed
              </AppText>
            )}

            <FormLabel required className="mt-md">
              Skill Level
            </FormLabel>
            <Controller
              control={control}
              name="level"
              render={({ field: { value, onChange } }) => (
                <BottomSheetSelect
                  title="Select skill level"
                  placeholder="Select your level"
                  options={SKILL_LEVEL_SELECT_OPTIONS}
                  value={value ?? ''}
                  onChange={onChange}
                  error={!!errors.level}
                  testID="onboarding-level-select"
                />
              )}
            />
            <FormError message={errors.level?.message} />

            <View className="h-px bg-divider my-lg" />

            <AppText className="text-caption font-semibold text-muted uppercase tracking-wider mb-md">
              Optional
            </AppText>

            <FormLabel>Nickname</FormLabel>
            <Controller
              control={control}
              name="nickname"
              render={({ field: { value, onChange } }) => (
                <Input
                  ref={nicknameRef}
                  value={value ?? ''}
                  onChangeText={onChange}
                  placeholder="What do people call you?"
                  autoCapitalize="words"
                  autoComplete="nickname"
                  textContentType="nickname"
                  returnKeyType="next"
                  onSubmitEditing={() => dobRef.current?.focus()}
                  blurOnSubmit={false}
                />
              )}
            />

            <FormLabel className="mt-md">Date of Birth</FormLabel>
            <Controller
              control={control}
              name="dateOfBirth"
              render={({ field: { value, onChange } }) => (
                <DateOfBirthField
                  ref={dobRef}
                  value={value ?? ''}
                  onChange={onChange}
                  error={!!errors.dateOfBirth}
                  testID="onboarding-dob-input"
                />
              )}
            />
            <FormError message={errors.dateOfBirth?.message} />

            <View className="mt-xl">
              <Button
                title="Save Profile"
                onPress={handleSubmit(onSubmit)}
                disabled={isSubmitting}
                loading={isSubmitting}
                variant="secondary"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
