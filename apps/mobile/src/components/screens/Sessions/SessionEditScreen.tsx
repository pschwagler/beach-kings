/**
 * SessionEditScreen — edit an existing session's details.
 *
 * Modal nav (X close left, title "Edit Session").
 * Wireframe ref: session-edit-details.html
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
import { useSessionEditScreen } from './useSessionEditScreen';
import type { SessionType } from '@/lib/mockApi';

// ---------------------------------------------------------------------------
// Sub-components (reused from create screen pattern)
// ---------------------------------------------------------------------------

interface FormRowProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (v: string) => void;
  readonly placeholder?: string;
  readonly testID?: string;
}

function FormRow({ label, value, onChangeText, placeholder, testID }: FormRowProps): React.ReactNode {
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
        const label = type === 'pickup' ? 'Pickup' : 'League';
        const isActive = selected === type;
        return (
          <TouchableOpacity
            key={type}
            onPress={() => onChange(type)}
            testID={`edit-session-type-${type}`}
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

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

interface Props {
  readonly sessionId: number;
}

export default function SessionEditScreen({ sessionId }: Props): React.ReactNode {
  const {
    date,
    startTime,
    courtName,
    sessionType,
    notes,
    isSubmitting,
    submitError,
    setDate,
    setStartTime,
    setCourtName,
    setSessionType,
    setNotes,
    onSave,
    onCancel,
  } = useSessionEditScreen(sessionId);

  return (
    <SafeAreaView
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
      testID="session-edit-screen"
    >
      <TopNav
        title="Edit Session"
        leftAction={
          <TouchableOpacity
            onPress={onCancel}
            testID="session-edit-close-btn"
            className="p-[8px]"
          >
            <Text className="text-[16px] text-text-default dark:text-content-primary">✕</Text>
          </TouchableOpacity>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1"
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Session Name (date as identifier) */}
          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[20px] mb-[4px]">
            Date &amp; Time
          </Text>
          <FormRow
            label="Date"
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            testID="edit-session-date-input"
          />
          <FormRow
            label="Start Time"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="e.g. 3:00 PM"
            testID="edit-session-time-input"
          />

          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[4px]">
            Location
          </Text>
          <FormRow
            label="Court"
            value={courtName}
            onChangeText={setCourtName}
            placeholder="Court name"
            testID="edit-session-court-input"
          />

          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[4px]">
            Session Type
          </Text>
          <TypePills selected={sessionType} onChange={setSessionType} />

          <Text className="text-[15px] font-bold text-text-default dark:text-content-primary mt-[24px] mb-[8px]">
            Notes
          </Text>
          <TextInput
            testID="edit-session-notes-input"
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes..."
            placeholderTextColor="#999"
            multiline
            numberOfLines={4}
            className="border border-[#ddd] dark:border-[#333] rounded-[10px] p-[12px] text-[14px] text-text-default dark:text-content-primary min-h-[96px]"
            textAlignVertical="top"
          />

          {submitError != null && (
            <Text
              testID="session-edit-error"
              className="text-[13px] text-red-500 mt-[12px] text-center"
            >
              {submitError}
            </Text>
          )}
        </ScrollView>

        <View className="absolute bottom-0 left-0 right-0 bg-white dark:bg-base border-t border-[#eee] dark:border-[#2a2a2a] px-[16px] pt-[12px] pb-[34px] gap-[8px]">
          <TouchableOpacity
            testID="session-edit-save-btn"
            onPress={() => { void onSave(); }}
            disabled={isSubmitting}
            className="bg-[#1a3a4a] rounded-[12px] items-center justify-center py-[16px]"
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" testID="session-edit-loading" />
            ) : (
              <Text className="text-white text-[16px] font-bold">Save Changes</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            testID="session-edit-cancel-btn"
            onPress={onCancel}
            className="border border-[#e0e0e0] dark:border-[#333] bg-[#f5f5f5] dark:bg-[#222] rounded-[12px] items-center justify-center py-[14px]"
          >
            <Text className="text-[15px] font-semibold text-text-secondary dark:text-content-secondary">
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
