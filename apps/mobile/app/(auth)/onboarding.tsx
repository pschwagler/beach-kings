import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Alert, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { Button, TopNav } from '@/components/ui';
import { api } from '@/lib/api';

const TOTAL_STEPS = 3;

const SKILL_LEVELS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'open', label: 'Open' },
] as const;

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

interface Location {
  readonly id: string;
  readonly name: string;
  readonly city: string;
  readonly state: string;
}

export default function OnboardingScreen(): React.ReactNode {
  const { setProfileComplete } = useAuth();

  const [step, setStep] = useState(1);
  const [gender, setGender] = useState('');
  const [level, setLevel] = useState('');
  const [locationId, setLocationId] = useState('');
  const [locations, setLocations] = useState<readonly Location[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);

  // Fetch locations when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    let cancelled = false;
    setIsLoadingLocations(true);
    api.client.axiosInstance
      .get('/api/locations')
      .then((res) => {
        if (!cancelled) setLocations(res.data);
      })
      .catch(() => {
        if (!cancelled) {
          Alert.alert('Error', 'Failed to load locations.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingLocations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const handleNext = useCallback(() => {
    if (step === 1 && !gender) return;
    if (step === 2 && !level) return;
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS));
  }, [step, gender, level]);

  const handleBack = useCallback(() => {
    setStep((prev) => Math.max(prev - 1, 1));
  }, []);

  const handleComplete = useCallback(async () => {
    if (!locationId) return;
    setIsSubmitting(true);

    const selectedLocation = locations.find((l) => l.id === locationId);
    try {
      await api.client.axiosInstance.put('/api/users/me/player', {
        gender,
        level,
        location_id: locationId,
        city: selectedLocation?.city ?? '',
        state: selectedLocation?.state ?? '',
      });
      setProfileComplete(true);
    } catch {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [gender, level, locationId, locations, setProfileComplete]);

  return (
    <SafeAreaView className="flex-1 bg-bg-page dark:bg-base">
      <TopNav title="Complete Profile" />

      <ScrollView
        className="flex-1 px-lg"
        contentContainerClassName="py-lg"
      >
        {/* Step indicator */}
        <Text className="text-footnote text-gray-500 dark:text-content-secondary text-center mb-lg">
          Step {step} of {TOTAL_STEPS}
        </Text>

        {/* Step 1: Gender */}
        {step === 1 && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              What's your gender?
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              This helps us match you in the right divisions.
            </Text>
            <View className="gap-sm">
              {GENDER_OPTIONS.map((option) => (
                <Pressable
                  key={option.value}
                  className={`p-lg rounded-card border-2 ${
                    gender === option.value
                      ? 'border-primary dark:border-brand-teal bg-primary/10 dark:bg-brand-teal/10'
                      : 'border-border dark:border-border-strong bg-white dark:bg-dark-surface'
                  }`}
                  onPress={() => setGender(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: gender === option.value }}
                  accessibilityLabel={option.label}
                >
                  <Text
                    className={`text-body text-center font-semibold ${
                      gender === option.value
                        ? 'text-primary dark:text-brand-teal'
                        : 'text-gray-700 dark:text-content-primary'
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Step 2: Skill level */}
        {step === 2 && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              What's your skill level?
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              Be honest — it helps create balanced games.
            </Text>
            <View className="gap-sm">
              {SKILL_LEVELS.map((option) => (
                <Pressable
                  key={option.value}
                  className={`p-lg rounded-card border-2 ${
                    level === option.value
                      ? 'border-primary dark:border-brand-teal bg-primary/10 dark:bg-brand-teal/10'
                      : 'border-border dark:border-border-strong bg-white dark:bg-dark-surface'
                  }`}
                  onPress={() => setLevel(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: level === option.value }}
                  accessibilityLabel={option.label}
                >
                  <Text
                    className={`text-body text-center font-semibold ${
                      level === option.value
                        ? 'text-primary dark:text-brand-teal'
                        : 'text-gray-700 dark:text-content-primary'
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* Step 3: Location */}
        {step === 3 && (
          <View className="gap-md">
            <Text className="text-title2 font-bold text-primary dark:text-content-primary text-center mb-sm">
              Where do you play?
            </Text>
            <Text className="text-body text-gray-500 dark:text-content-secondary text-center mb-md">
              Select your primary location for leagues and events.
            </Text>
            {isLoadingLocations ? (
              <ActivityIndicator size="large" />
            ) : (
              <View className="gap-sm">
                {locations.map((loc) => (
                  <Pressable
                    key={loc.id}
                    className={`p-lg rounded-card border-2 ${
                      locationId === loc.id
                        ? 'border-primary dark:border-brand-teal bg-primary/10 dark:bg-brand-teal/10'
                        : 'border-border dark:border-border-strong bg-white dark:bg-dark-surface'
                    }`}
                    onPress={() => setLocationId(loc.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: locationId === loc.id }}
                    accessibilityLabel={loc.name}
                  >
                    <Text
                      className={`text-body text-center font-semibold ${
                        locationId === loc.id
                          ? 'text-primary dark:text-brand-teal'
                          : 'text-gray-700 dark:text-content-primary'
                      }`}
                    >
                      {loc.name}
                    </Text>
                    <Text className="text-footnote text-gray-500 dark:text-content-secondary text-center">
                      {loc.city}, {loc.state}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Navigation buttons */}
        <View className="flex-row gap-md mt-xl">
          {step > 1 && (
            <Button
              title="Back"
              onPress={handleBack}
              variant="outline"
              className="flex-1"
            />
          )}
          {step < TOTAL_STEPS ? (
            <Button
              title="Next"
              onPress={handleNext}
              className="flex-1"
            />
          ) : (
            <Button
              title="Complete"
              onPress={handleComplete}
              disabled={isSubmitting || !locationId}
              loading={isSubmitting}
              className="flex-1"
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
