/**
 * SessionCreateScreen — form for starting a new pickup or league session.
 *
 * Wireframe ref: session-create.html
 *
 * Sections:
 *   - Date / Start Time rows
 *   - Court name input
 *   - Session type pills (Open Pickup / League Only)
 *   - Max players stepper (2-64)
 *   - Notes textarea
 *   - Fixed bottom "Start Session" button
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
import { useSessionCreateScreen } from './useSessionCreateScreen';
import type { SessionType } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface FormRowProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly placeholder?: string;
  readonly testID?: string;
}

function FormRow({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
}: FormRowProps): React.ReactNode {
  return (
    <View className="flex-row items-center py-[14px] border-b border-[#eee] dark:border-[#2a2a2a]">
      <Text className="text-[14px] font-semibold text-text-secondary dark:text-content-secondary w-[100px]">
        {label}
      </Text>
      <TextInput
        className="flex-1 text-[14px] text-text-default dark:text-content-primary"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#999"
        testID={testID}
      />
    </View>
  );
}

interface TypePillsProps {
  readonly selected: SessionType;
  readonly onChange: (v: SessionType) => void;
}

function TypePills({ selected, onChange }: TypePillsProps): React.ReactNode {
  return (
    <View className="flex-row gap-[8px] mt-[8px]">
      {(['pickup', 'league'] as const).map((type) => {
        const label = type === 'pickup' ? 'Open Pickup' : 'League Only';
        const isActive = selected === type;
        return (
          <TouchableOpacity
            key={type}
            onPress={() => onChange(type)}
            testID={`session-type-${type}`}
            className={`px-[18px] py-[8px] rounded-[20px] border ${
              isActive
                ? 'border-[#2a7d9c] bg-[#e8f4f8]'
                : 'border-[#ddd] bg-white dark:bg-[#1a1a1a] dark:border-[#333]'
            }`}
          >
            <Text
              className={`text-[13px] font-semibold ${
                isActive
                  ? 'text-[#2a7d9c]'
                  : 'text-text-secondary dark:text-content-secondary'
              }`}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

interface StepperProps {
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (v: number) => void;
  readonly testID?: string;
}

function Stepper({ value, min, max, onChange, testID }: StepperProps): React.ReactNode {
  return (
    <View className="flex-row items-center gap-[16px]" testID={testID}>
      <TouchableOpacity
        onPress={() => onChange(Math.max(min, value - 1))}
        testID="stepper-decrement"
        className="w-[44px] h-[44px] rounded-[10px] border border-[#ddd] dark:border-[#333] bg-white dark:bg-[#1a1a1a] items-center justify-center"
        accessibilityLabel="Decrease"
      >
        <Text className="text-[18px] font-bold text-[#1a3a4a] dark:text-content-primary">−</Text>
      </TouchableOpacity>
      <Text
        testID="stepper-value"
        className="text-[20px] font-bold text-text-default dark:text-content-primary min-w-[40px] text-center"
      >
        {value}
      </Text>
      <TouchableOpacity
        onPress={() => onChange(Math.min(max, value + 1))}
        testID="stepper-increment"
        className="w-[44px] h-[44px] rounded-[10px] border border-[#ddd] dark:border-[#333] bg-white dark:bg-[#1a1a1a] items-center justify-center"
        accessibilityLabel="Increase"
      >
        <Text className="text-[18px] font-bold text-[#1a3a4a] dark:text-content-primary">+</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export default function SessionCreateScreen(): React.ReactNode {
  const {
    date,
    startTime,
    courtName,
    sessionType,
    maxPlayers,
    notes,
    isSubmitting,
    submitError,
    setDate,
    setStartTime,
    setCourtName,
    setSessionType,
    setMaxPlayers,
    setNotes,
    onSubmit,
  } = useSessionCreateScreen();

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="session-create-screen"
    >
      <TopNav title="Start Session" showBack />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Date / Time */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[20px] mb-[4px]">
            Date &amp; Time
          </Text>
          <FormRow
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            testID="session-date-input"
          />
          <FormRow
            label="Start Time"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="e.g. 3:00 PM"
            testID="session-time-input"
          />

          {/* Location */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[4px]">
            Location
          </Text>
          <FormRow
            label="Court"
            value={courtName}
            onChangeText={setCourtName}
            placeholder="Court name"
            testID="session-court-input"
          />

          {/* Session Type */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[4px]">
            Session Type
          </Text>
          <TypePills selected={sessionType} onChange={setSessionType} />

          {/* Player Signups */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[4px]">
            Player Signups
          </Text>
          <View className="flex-row items-center justify-between py-[14px] border-b border-[#eee] dark:border-[#2a2a2a]">
            <Text className="text-[14px] font-semibold text-text-secondary dark:text-content-secondary">
              Max Players
            </Text>
            <Stepper
              value={maxPlayers}
              min={2}
              max={64}
              onChange={setMaxPlayers}
              testID="max-players-stepper"
            />
          </View>

          {/* Notes */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[8px]">
            Notes
          </Text>
          <TextInput
            testID="session-notes-input"
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes for players..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            className="border border-[#ddd] dark:border-[#333] rounded-[10px] p-[12px] text-[14px] text-text-default dark:text-content-primary min-h-[96px]"
            textAlignVertical="top"
          />

          {/* Error */}
          {submitError != null && (
            <Text
              testID="session-create-error"
              className="text-[13px] text-red-500 mt-[12px] text-center"
            >
              {submitError}
            </Text>
          )}
        </ScrollView>

        {/* Fixed bottom CTA */}
        <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-base border-t border-[#eee] dark:border-[#2a2a2a] px-[16px] pt-[12px] pb-[34px]">
          <TouchableOpacity
            testID="session-create-submit-btn"
            onPress={onSubmit}
            disabled={isSubmitting}
            className="bg-[#d4a843] rounded-[12px] items-center justify-center py-[16px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" testID="session-create-loading" />
            ) : (
              <Text className="text-white text-[16px] font-bold">Start Session</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
