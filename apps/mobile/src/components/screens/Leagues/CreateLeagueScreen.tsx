/**
 * CreateLeagueScreen — form to create a new league.
 *
 * Sections:
 *   League Details (Name, Description, Access toggle)
 *   Settings (Gender pills, Level select, Home Court)
 *   Create button (gold/disabled until valid)
 *
 * Wireframe ref: create-league.html
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import TopNav from '@/components/ui/TopNav';
import { hapticMedium, hapticLight } from '@/utils/haptics';
import { routes } from '@/lib/navigation';
import {
  useCreateLeagueScreen,
  type GenderOption,
  type LevelOption,
} from './useCreateLeagueScreen';
import type { LeagueAccessType } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { readonly title: string }): React.ReactNode {
  return (
    <Text className="text-[12px] font-semibold text-text-secondary dark:text-content-secondary uppercase tracking-wider px-4 pt-5 pb-1">
      {title}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Access toggle
// ---------------------------------------------------------------------------

interface AccessToggleProps {
  readonly value: LeagueAccessType;
  readonly onChange: (v: LeagueAccessType) => void;
}

function AccessToggle({ value, onChange }: AccessToggleProps): React.ReactNode {
  const options: Array<{ key: LeagueAccessType; label: string; desc: string }> = [
    { key: 'open', label: 'Open', desc: 'Anyone can request to join' },
    { key: 'invite_only', label: 'Invite Only', desc: 'Members join by invitation' },
  ];

  return (
    <View className="mx-4 rounded-[12px] border border-[#e8e8e8] dark:border-border-subtle overflow-hidden bg-white dark:bg-dark-surface">
      {options.map(({ key, label, desc }, idx) => {
        const isActive = value === key;
        return (
          <Pressable
            key={key}
            testID={`access-toggle-${key}`}
            onPress={() => {
              void hapticLight();
              onChange(key);
            }}
            className={`flex-row items-center px-4 py-[14px] ${
              idx > 0 ? 'border-t border-[#f0f0f0] dark:border-border-subtle' : ''
            } active:opacity-70`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <View
              className={`w-5 h-5 rounded-full border-2 items-center justify-center mr-3 ${
                isActive
                  ? 'border-[#1a3a4a] dark:border-brand-teal'
                  : 'border-[#ccc] dark:border-border-strong'
              }`}
            >
              {isActive && (
                <View className="w-2.5 h-2.5 rounded-full bg-[#1a3a4a] dark:bg-brand-teal" />
              )}
            </View>
            <View className="flex-1">
              <Text className="text-[14px] font-semibold text-text-default dark:text-content-primary">
                {label}
              </Text>
              <Text className="text-[12px] text-text-secondary dark:text-content-secondary mt-[2px]">
                {desc}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Gender pill selector
// ---------------------------------------------------------------------------

interface GenderPillsProps {
  readonly value: GenderOption;
  readonly onChange: (v: GenderOption) => void;
}

function GenderPills({ value, onChange }: GenderPillsProps): React.ReactNode {
  const options: Array<{ key: GenderOption; label: string }> = [
    { key: 'mens', label: "Men's" },
    { key: 'womens', label: "Women's" },
    { key: 'coed', label: 'Coed' },
  ];

  return (
    <View className="flex-row gap-2 px-4">
      {options.map(({ key, label }) => {
        const isActive = value === key;
        return (
          <Pressable
            key={key}
            testID={`gender-pill-${key}`}
            onPress={() => {
              void hapticLight();
              onChange(key);
            }}
            className={`px-4 py-[10px] rounded-full border ${
              isActive
                ? 'bg-[#1a3a4a] dark:bg-brand-teal border-[#1a3a4a] dark:border-brand-teal'
                : 'bg-white dark:bg-dark-surface border-[#ddd] dark:border-border-strong'
            } active:opacity-70`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isActive }}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive
                  ? 'text-white'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Level selector
// ---------------------------------------------------------------------------

interface LevelSelectorProps {
  readonly value: LevelOption | '';
  readonly onChange: (v: LevelOption | '') => void;
}

const LEVELS: LevelOption[] = ['Open', 'AA', 'A', 'BB', 'B'];

function LevelSelector({ value, onChange }: LevelSelectorProps): React.ReactNode {
  return (
    <View className="flex-row flex-wrap gap-2 px-4">
      {LEVELS.map((lvl) => {
        const isActive = value === lvl;
        return (
          <Pressable
            key={lvl}
            testID={`level-option-${lvl}`}
            onPress={() => {
              void hapticLight();
              onChange(isActive ? '' : lvl);
            }}
            className={`px-4 py-[10px] rounded-[8px] border ${
              isActive
                ? 'bg-[#1a3a4a] dark:bg-brand-teal border-[#1a3a4a] dark:border-brand-teal'
                : 'bg-white dark:bg-dark-surface border-[#ddd] dark:border-border-strong'
            } active:opacity-70`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive
                  ? 'text-white'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {lvl}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function CreateLeagueScreen(): React.ReactNode {
  const router = useRouter();
  const {
    form,
    isSubmitting,
    submitError,
    isValid,
    onChangeName,
    onChangeDescription,
    onChangeAccessType,
    onChangeGender,
    onChangeLevel,
    onChangeHomeCourt,
    onSubmit,
  } = useCreateLeagueScreen();

  const descriptionRef = useRef<TextInput>(null);
  const homeCourtRef = useRef<TextInput>(null);

  const handleSubmit = async (): Promise<void> => {
    void hapticMedium();
    const newId = await onSubmit();
    if (newId != null) {
      router.push(routes.league(newId));
    }
  };

  const cancelAction = (
    <Pressable
      testID="create-league-cancel"
      onPress={() => router.back()}
      accessibilityRole="button"
      accessibilityLabel="Cancel"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      <Text className="text-[14px] font-semibold text-white">Cancel</Text>
    </Pressable>
  );

  const createAction = (
    <Pressable
      testID="create-league-submit"
      onPress={() => { void handleSubmit(); }}
      disabled={!isValid || isSubmitting}
      accessibilityRole="button"
      accessibilityLabel="Create league"
      className="min-w-touch min-h-touch items-center justify-center active:opacity-70"
    >
      {isSubmitting ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text
          className={`text-[14px] font-semibold ${
            isValid ? 'text-white' : 'text-white/40'
          }`}
        >
          Create
        </Text>
      )}
    </Pressable>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      edges={['top']}
    >
      <TopNav title="Create League" leftAction={cancelAction} rightAction={createAction} />
      <KeyboardAvoidingView
      testID="create-league-screen"
      className="flex-1 bg-[#f5f5f5] dark:bg-base"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- League Details ---- */}
        <SectionHeader title="League Details" />

        <View className="bg-white dark:bg-dark-surface rounded-[12px] mx-4 border border-[#e8e8e8] dark:border-border-subtle overflow-hidden">
          {/* Name */}
          <View className="px-4 pt-[14px] pb-[10px]">
            <Text className="text-[11px] font-semibold text-text-secondary dark:text-content-secondary uppercase tracking-wide mb-1">
              League Name *
            </Text>
            <TextInput
              testID="league-name-input"
              value={form.name}
              onChangeText={onChangeName}
              placeholder="e.g. QBK Open Men"
              placeholderTextColor="#aaa"
              className="text-[16px] text-text-default dark:text-content-primary"
              returnKeyType="next"
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="off"
              textContentType="organizationName"
              maxLength={80}
              onSubmitEditing={() => descriptionRef.current?.focus()}
            />
          </View>

          <View className="h-[1px] bg-[#f0f0f0] dark:bg-border-subtle mx-4" />

          {/* Description */}
          <View className="px-4 pt-[14px] pb-[10px]">
            <Text className="text-[11px] font-semibold text-text-secondary dark:text-content-secondary uppercase tracking-wide mb-1">
              Description (optional)
            </Text>
            <TextInput
              ref={descriptionRef}
              testID="league-description-input"
              value={form.description}
              onChangeText={onChangeDescription}
              placeholder="Describe your league…"
              placeholderTextColor="#aaa"
              className="text-[15px] text-text-default dark:text-content-primary"
              multiline
              numberOfLines={3}
              returnKeyType="default"
              autoCapitalize="sentences"
              autoCorrect
              maxLength={500}
              style={{ minHeight: 64 }}
            />
          </View>
        </View>

        {/* ---- Access ---- */}
        <SectionHeader title="Access" />
        <AccessToggle value={form.access_type} onChange={onChangeAccessType} />

        {/* ---- Settings ---- */}
        <SectionHeader title="Settings" />

        <View className="mb-3">
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary px-4 mb-2">
            Gender
          </Text>
          <GenderPills value={form.gender} onChange={onChangeGender} />
        </View>

        <View className="mb-3">
          <Text className="text-[12px] text-text-secondary dark:text-content-secondary px-4 mb-2">
            Skill Level
          </Text>
          <LevelSelector value={form.level} onChange={onChangeLevel} />
        </View>

        <View className="bg-white dark:bg-dark-surface rounded-[12px] mx-4 border border-[#e8e8e8] dark:border-border-subtle overflow-hidden">
          <View className="px-4 pt-[14px] pb-[10px]">
            <Text className="text-[11px] font-semibold text-text-secondary dark:text-content-secondary uppercase tracking-wide mb-1">
              Home Court (optional)
            </Text>
            <TextInput
              ref={homeCourtRef}
              testID="home-court-input"
              value={form.home_court_name}
              onChangeText={onChangeHomeCourt}
              placeholder="e.g. QBK Sports"
              placeholderTextColor="#aaa"
              className="text-[15px] text-text-default dark:text-content-primary"
              returnKeyType="done"
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="off"
              textContentType="none"
              maxLength={80}
            />
          </View>
        </View>

        {/* ---- Error ---- */}
        {submitError != null && (
          <View
            testID="submit-error"
            className="mx-4 mt-4 bg-red-50 dark:bg-red-900/20 rounded-[10px] p-3"
          >
            <Text className="text-[13px] text-red-600 dark:text-red-400">
              {submitError}
            </Text>
          </View>
        )}

        {/* ---- Create button ---- */}
        <Pressable
          testID="create-league-button"
          onPress={() => { void handleSubmit(); }}
          disabled={!isValid || isSubmitting}
          accessibilityRole="button"
          accessibilityLabel="Create league"
          className={`mx-4 mt-6 rounded-[12px] py-[16px] items-center justify-center ${
            isValid && !isSubmitting
              ? 'bg-[#c8a84b] active:opacity-80'
              : 'bg-[#e0d5b4] dark:bg-[#4a4030]'
          }`}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text
              className={`text-[16px] font-bold ${
                isValid ? 'text-white' : 'text-[#a0906e] dark:text-[#7a6a4e]'
              }`}
            >
              Create League
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
