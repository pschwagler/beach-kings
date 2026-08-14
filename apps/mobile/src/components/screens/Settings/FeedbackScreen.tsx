/**
 * FeedbackScreen — full-screen feedback form.
 *
 * Presented as a slide-up route (presentation: 'modal') so it feels modal but
 * gives the keyboard real space — Cancel/Send live in the TopNav and stay
 * visible above the keyboard. Tap-anywhere-on-body dismisses the keyboard.
 */

import React, { useCallback, useState } from 'react';
import AppText from '@/components/ui/AppText';
import {
  View,
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
import { usePaletteColors } from '@/theme/usePaletteColors';

const MAX_LENGTH = 2000;
const INPUT_MIN_HEIGHT = 180;
const INPUT_MAX_HEIGHT = 280;

export default function FeedbackScreen(): React.ReactNode {
  const router = useRouter();
  const palette = usePaletteColors();
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
      className="flex-1 bg-page"
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
            <AppText className="text-inverse text-[15px]">Cancel</AppText>
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
              <ActivityIndicator size="small" color={palette.textInverse} />
            ) : (
              <AppText
                className={`text-[15px] font-semibold ${
                  canSubmit ? 'text-inverse' : 'text-inverse opacity-40'
                }`}
              >
                Send
              </AppText>
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
            <AppText className="text-[15px] text-muted mb-lg">
              Tell us what you think, what's broken, or what you'd like to see.
            </AppText>

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
              placeholderTextColor={palette.textTertiary}
              multiline
              maxLength={MAX_LENGTH}
              editable={!isSubmitting}
              autoFocus
              scrollEnabled
              style={{ height: inputHeight }}
              className="bg-surface rounded-xl px-md py-md text-[15px] text-default border border-divider"
              textAlignVertical="top"
            />

            <View className="flex-row justify-between mt-sm">
              <View className="flex-1">
                {error != null && (
                  <AppText testID="feedback-error" className="text-danger text-sm">
                    {error}
                  </AppText>
                )}
              </View>
              <AppText className="text-[12px] text-muted">
                {text.length}/{MAX_LENGTH}
              </AppText>
            </View>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
