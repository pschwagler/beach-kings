/**
 * TournamentCreateScreen — form for creating a new KoB tournament.
 *
 * Sections:
 *   - Tournament Setup: Name, Max Players, Courts
 *   - Registration: Type toggle, Lock toggle
 *   - Game Settings: Game To, Score Cap
 *   - Additional: Gender pills
 *   - Fixed bottom "Create Tournament" button
 *
 * Wireframe ref: tournament-edit.html (same fields, adapted for create)
 */

import React from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import TopNav from '@/components/ui/TopNav';
import { routes } from '@/lib/navigation';
import { useTournamentCreateScreen } from './useTournamentCreateScreen';
import type { TournamentGender, TournamentFormat, RegistrationType } from './useTournamentCreateScreen';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StepperProps {
  readonly value: number;
  readonly min: number;
  readonly max?: number;
  readonly onChange: (v: number) => void;
  readonly testID?: string;
}

function Stepper({ value, min, max, onChange, testID }: StepperProps): React.ReactNode {
  return (
    <View className="flex-row items-center gap-[16px]" testID={testID}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        testID="stepper-decrement"
        className="w-[44px] h-[44px] rounded-[10px] border border-divider bg-surface items-center justify-center"
      >
        <Text className="text-[18px] font-bold text-brand-teal">−</Text>
      </TouchableOpacity>
      <Text testID="stepper-value" className="text-[20px] font-bold text-default min-w-[40px] text-center">
        {value}
      </Text>
      <TouchableOpacity
        onPress={() => onChange(max != null ? Math.min(max, value + 1) : value + 1)}
        testID="stepper-increment"
        className="w-[44px] h-[44px] rounded-[10px] border border-divider bg-surface items-center justify-center"
      >
        <Text className="text-[18px] font-bold text-brand-teal">+</Text>
      </TouchableOpacity>
    </View>
  );
}

interface ToggleRowProps {
  readonly options: { key: string; label: string }[];
  readonly selected: string;
  readonly onSelect: (key: string) => void;
  readonly testIDPrefix?: string;
}

function ToggleRow({ options, selected, onSelect, testIDPrefix }: ToggleRowProps): React.ReactNode {
  return (
    <View className="flex-row rounded-[10px] overflow-hidden border border-divider">
      {options.map(({ key, label }) => {
        const isActive = selected === key;
        return (
          <TouchableOpacity
            key={key}
            testID={testIDPrefix != null ? `${testIDPrefix}-${key}` : key}
            onPress={() => onSelect(key)}
            className={`flex-1 py-[10px] items-center ${isActive ? 'bg-brand-teal' : 'bg-surface'}`}
          >
            <Text
              className={`text-[13px] font-semibold ${isActive ? 'text-white' : 'text-muted'}`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface GenderPillsProps {
  readonly selected: TournamentGender;
  readonly onChange: (v: TournamentGender) => void;
}

function GenderPills({ selected, onChange }: GenderPillsProps): React.ReactNode {
  const options: { key: TournamentGender; label: string }[] = [
    { key: 'coed', label: 'Coed' },
    { key: 'mens', label: "Men's" },
    { key: 'womens', label: "Women's" },
  ];
  return (
    <View className="flex-row gap-[8px]">
      {options.map(({ key, label }) => {
        const isActive = selected === key;
        return (
          <TouchableOpacity
            key={key}
            testID={`tournament-gender-${key}`}
            onPress={() => onChange(key)}
            className={`px-[18px] py-[8px] rounded-[20px] border ${
              isActive
                ? 'border-brand-teal bg-info-tint'
                : 'border-divider bg-surface'
            }`}
          >
            <Text className={`text-[13px] font-semibold ${isActive ? 'text-brand-teal' : 'text-muted'}`}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function TournamentCreateScreen(): React.ReactNode {
  const {
    name,
    scheduledDate,
    maxPlayers,
    numCourts,
    gameTo,
    scoreCap,
    gender,
    format,
    registrationType,
    isSubmitting,
    submitError,
    setName,
    setScheduledDate,
    setMaxPlayers,
    setNumCourts,
    setGameTo,
    setScoreCap,
    setGender,
    setFormat,
    setRegistrationType,
    onSubmit,
  } = useTournamentCreateScreen();

  return (
    <SafeAreaView
      className="flex-1 bg-page"
      edges={['top']}
      testID="tournament-create-screen"
    >
      <TopNav title="Create Tournament" showBack backFallback={routes.tournaments()} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Tournament Setup */}
          <Text className="text-[15px] font-bold text-default mt-[20px] mb-[10px]">
            Tournament Setup
          </Text>

          <Text className="text-[13px] font-semibold text-muted mb-[6px]">
            Tournament Name
          </Text>
          <TextInput
            testID="tournament-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Sunday Showdown KoB"
            placeholderTextColor="#999"
            className="border border-divider rounded-[10px] p-[12px] text-[14px] text-default mb-[16px]"
          />

          <Text className="text-[13px] font-semibold text-muted mb-[6px]">
            Date
          </Text>
          <TextInput
            testID="tournament-date-input"
            value={scheduledDate}
            onChangeText={setScheduledDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#999"
            className="border border-divider rounded-[10px] p-[12px] text-[14px] text-default mb-[16px]"
          />

          <Text className="text-[13px] font-semibold text-muted mb-[8px]">
            Max Players
          </Text>
          <Stepper
            value={maxPlayers}
            min={2}
            onChange={setMaxPlayers}
            testID="max-players-stepper"
          />

          <Text className="text-[13px] font-semibold text-muted mt-[16px] mb-[8px]">
            Courts
          </Text>
          <Stepper
            value={numCourts}
            min={1}
            onChange={setNumCourts}
            testID="courts-stepper"
          />

          {/* Registration */}
          <Text className="text-[15px] font-bold text-default mt-[24px] mb-[10px]">
            Registration
          </Text>

          <Text className="text-[13px] font-semibold text-muted mb-[8px]">
            Registration Type
          </Text>
          <ToggleRow
            options={[
              { key: 'open', label: 'Open' },
              { key: 'invite', label: 'Invite Only' },
            ]}
            selected={registrationType}
            onSelect={(k) => setRegistrationType(k as RegistrationType)}
            testIDPrefix="tournament-registration"
          />
          <Text className="text-[11px] text-muted mt-[6px] mb-[16px]">
            Open: players request to join, you approve. Invite Only: only players you invite can join.
          </Text>

          {/* Game Settings */}
          <Text className="text-[15px] font-bold text-default mt-[8px] mb-[10px]">
            Game Settings
          </Text>

          <Text className="text-[13px] font-semibold text-muted mb-[8px]">
            Format
          </Text>
          <ToggleRow
            options={[
              { key: 'POOLS_PLAYOFFS', label: 'KoB' },
              { key: 'FULL_ROUND_ROBIN', label: 'Round Robin' },
            ]}
            selected={format}
            onSelect={(k) => setFormat(k as TournamentFormat)}
            testIDPrefix="tournament-format"
          />

          <Text className="text-[13px] font-semibold text-muted mt-[16px] mb-[8px]">
            Game To
          </Text>
          <Stepper value={gameTo} min={1} onChange={setGameTo} testID="game-to-stepper" />

          <Text className="text-[13px] font-semibold text-muted mt-[16px] mb-[8px]">
            Score Cap
          </Text>
          <Stepper value={scoreCap} min={1} onChange={setScoreCap} testID="score-cap-stepper" />

          {/* Additional */}
          <Text className="text-[15px] font-bold text-default mt-[24px] mb-[10px]">
            Additional
          </Text>

          <Text className="text-[13px] font-semibold text-muted mb-[8px]">
            Gender
          </Text>
          <GenderPills selected={gender} onChange={setGender} />

          {submitError != null && (
            <Text
              testID="tournament-create-error"
              className="text-[13px] text-red-500 mt-[16px] text-center"
            >
              {submitError}
            </Text>
          )}
        </ScrollView>

        {/* Fixed bottom CTA */}
        <View className="absolute bottom-0 left-0 right-0 bg-surface border-t border-divider px-[16px] pt-[12px] pb-[34px]">
          <TouchableOpacity
            testID="tournament-create-submit-btn"
            onPress={() => { void onSubmit(); }}
            disabled={isSubmitting}
            className="bg-brand-teal rounded-[12px] items-center justify-center py-[16px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" testID="tournament-create-loading" />
            ) : (
              <Text className="text-white text-[16px] font-bold">Create Tournament</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
