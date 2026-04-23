import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Alert,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  GENDER_OPTIONS,
  SKILL_LEVEL_OPTIONS,
  SKILL_LEVEL_DESCRIPTIONS,
} from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { Button, Input } from '@/components/ui';
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
import {
  useLocationAutoSelect,
  type LocationWithDistance,
} from '@/lib/useLocationAutoSelect';
import { fullStateName } from '@/lib/usStates';
import type { PlayerGender, SkillLevel, Location } from '@beach-kings/shared';

type Screen = 'form' | 'success';

const SKILL_LEVEL_SELECT_OPTIONS: readonly SelectOption[] = SKILL_LEVEL_OPTIONS.map(
  (opt) => ({
    value: opt.value,
    label: opt.label,
    sublabel: SKILL_LEVEL_DESCRIPTIONS[opt.value],
  }),
);

const GENDER_SELECT_OPTIONS: readonly SelectOption[] = GENDER_OPTIONS.map((g) => ({
  value: g.value,
  label: g.label,
}));

function formatLocationLabel(loc: LocationWithDistance): string {
  const base = loc.name ?? `${loc.city}, ${loc.state}`;
  if (typeof loc.distance_miles === 'number') {
    return `${base} (${Math.round(loc.distance_miles)} mi)`;
  }
  return base;
}

function buildLocationSearchText(loc: LocationWithDistance): string {
  return [
    loc.city,
    loc.state,
    fullStateName(loc.state),
    loc.name,
    loc.region_name,
  ]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .join(' ');
}

export default function OnboardingScreen(): React.ReactNode {
  const { setProfileComplete } = useAuth();
  const router = useRouter();

  const [screen, setScreen] = useState<Screen>('form');
  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    setIsLoadingLocations(true);
    api
      .getLocations()
      .then((data) => {
        if (!cancelled) setLocations(data);
      })
      .catch(() => {
        if (!cancelled) Alert.alert('Error', 'Failed to load locations.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLocations(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const onCityPicked = useCallback(
    (suggestion: CitySuggestion) => {
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
      try {
        await api.updatePlayerProfile({
          gender: values.gender as PlayerGender,
          level: values.level as SkillLevel,
          location_id: values.locationId,
          city: values.city.trim(),
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
      <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
        <View className="flex-1 items-center justify-center px-lg">
          <View className="bg-white dark:bg-dark-surface rounded-2xl px-lg py-xl items-center w-full max-w-md">
            <View
              testID="onboarding-success-check"
              className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900 items-center justify-center mb-md"
            >
              <CheckIcon size={32} color="#15803d" />
            </View>
            <Text className="text-title3 font-bold text-primary dark:text-content-primary text-center mb-xs">
              Profile Complete!
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-lg">
              You're all set. Find leagues near you, connect with players, and
              start tracking your games.
            </Text>
            <View className="w-full">
              <Button title="Get Started" onPress={handleGetStarted} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-dark-surface">
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
            <Text className="text-footnote font-semibold text-accent dark:text-brand-gold">
              Skip for now
            </Text>
          </Pressable>
          <View className="items-center mb-sm">
            <CrownIcon size={36} color="#d4a843" />
          </View>
          <Text className="text-title3 font-bold text-primary dark:text-content-primary text-center mb-xs">
            Complete Your Profile
          </Text>
          <Text className="text-footnote text-gray-500 dark:text-content-secondary text-center">
            Tell us about yourself so we can match you with the right leagues
            and players.
          </Text>
        </View>
        <ScrollView
          className="flex-1"
          contentContainerClassName="px-lg pb-lg"
          keyboardShouldPersistTaps="handled"
        >
          <View>
            <Text className="text-caption font-medium text-red-500 mb-md">
              * Required fields
            </Text>

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
                  testID="onboarding-location-select"
                  searchable
                  searchPlaceholder="Search city or state"
                />
              )}
            />
            {errors.locationId ? (
              <FormError message={errors.locationId.message} />
            ) : (
              <Text className="text-caption text-gray-400 dark:text-content-tertiary mt-xxs">
                Closest region auto-selected from your city — change if needed
              </Text>
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

            <View className="h-px bg-gray-100 dark:bg-border-strong my-lg" />

            <Text className="text-caption font-semibold text-gray-400 dark:text-content-tertiary uppercase tracking-wider mb-md">
              Optional
            </Text>

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
