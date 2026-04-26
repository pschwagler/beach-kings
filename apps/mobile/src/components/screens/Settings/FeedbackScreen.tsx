/**
 * FeedbackScreen — full-screen feedback form.
 *
 * Presented as a slide-up route (presentation: 'modal') so it feels modal but
 * gives the keyboard real space — Cancel/Send live in the TopNav and stay
 * visible above the keyboard. Tap-anywhere-on-body dismisses the keyboard.
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TextInput,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import TopNav from '@/components/ui/TopNav';
import { hapticMedium } from '@/utils/haptics';
import { api } from '@/lib/api';

const MAX_LENGTH = 2000;
const INPUT_MIN_HEIGHT = 180;
const INPUT_MAX_HEIGHT = 280;

export default function FeedbackScreen(): React.ReactNode {
  const router = useRouter();
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const handleCancel = useCallback(() => {
    Keyboard.dismiss();
    router.back();
  }, [router]);

  const handleSubmit = useCallback(async () => {
    if (trimmed.length === 0 || isSubmitting) return;
    Keyboard.dismiss();
    setIsSubmitting(true);
    setError(null);
    try {
      await api.submitFeedback(trimmed);
      void hapticMedium();
      Alert.alert('Thanks!', 'Your feedback has been submitted.');
      router.back();
    } catch {
      setError('Could not submit feedback. Please try again.');
      setIsSubmitting(false);
    }
  }, [trimmed, isSubmitting, router]);

  return (
    <SafeAreaView
      testID="feedback-screen"
      className="flex-1 bg-bg-page dark:bg-base"
      edges={['top']}
    >
      <TopNav
        title="Leave Feedback"
        leftAction={
          <Pressable
            testID="feedback-cancel-btn"
            onPress={handleCancel}
            disabled={isSubmitting}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="min-w-touch min-h-touch items-start justify-center"
          >
            <Text className="text-white text-[15px]">Cancel</Text>
          </Pressable>
        }
        rightAction={
          <Pressable
            testID="feedback-submit-btn"
            onPress={() => {
              void handleSubmit();
            }}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Send feedback"
            className="min-w-touch min-h-touch items-end justify-center"
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text
                className={`text-[15px] font-semibold ${
                  canSubmit ? 'text-white' : 'text-white/40'
                }`}
              >
                Send
              </Text>
            )}
          </Pressable>
        }
      />

      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <Pressable
          className="flex-1"
          onPress={Keyboard.dismiss}
          accessible={false}
        >
          <ScrollView
            className="flex-1"
            keyboardShouldPersistTaps="handled"
            contentContainerClassName="px-lg pt-xl pb-xxxl"
          >
            <Text className="text-[15px] text-text-muted dark:text-text-tertiary mb-lg">
              Tell us what you think, what's broken, or what you'd like to see.
            </Text>

            <TextInput
              testID="feedback-input"
              value={text}
              onChangeText={(value) => {
                setText(value);
                if (error != null) setError(null);
              }}
              onContentSizeChange={(e) => {
                const h = e.nativeEvent.contentSize.height;
                setInputHeight(
                  Math.min(INPUT_MAX_HEIGHT, Math.max(INPUT_MIN_HEIGHT, h)),
                );
              }}
              placeholder="Your feedback…"
              placeholderTextColor="#999"
              multiline
              maxLength={MAX_LENGTH}
              editable={!isSubmitting}
              autoFocus
              scrollEnabled
              style={{ height: inputHeight }}
              className="bg-white dark:bg-elevated rounded-xl px-md py-md text-[15px] text-text-default dark:text-content-primary border border-border dark:border-border-strong"
              textAlignVertical="top"
            />

            <View className="flex-row justify-between mt-sm">
              <View className="flex-1">
                {error != null && (
                  <Text testID="feedback-error" className="text-red-500 text-sm">
                    {error}
                  </Text>
                )}
              </View>
              <Text className="text-[12px] text-text-disabled">
                {text.length}/{MAX_LENGTH}
              </Text>
            </View>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
