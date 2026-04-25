/**
 * ChatComposer — shared input bar for chat surfaces (DM threads, league chat).
 *
 * Pin to the keyboard with `<KeyboardStickyView offset={...}>` from
 * `react-native-keyboard-controller` in the parent. This component handles only
 * the visuals + behavior of the composer row itself (pill input + iMessage-style
 * up-arrow send button).
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { hapticLight } from '@/utils/haptics';

export interface ChatComposerProps {
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  readonly onSend: () => void;
  readonly isSending?: boolean;
  readonly sendError?: string | null;
  readonly placeholder?: string;
  readonly autoFocus?: boolean;
  readonly maxLength?: number;
  /** Extra bottom padding (e.g. safe-area inset) so composer clears the home indicator. */
  readonly bottomInset?: number;
  readonly testID?: string;
  readonly inputTestID?: string;
  readonly sendTestID?: string;
}

export default function ChatComposer({
  value,
  onChangeText,
  onSend,
  isSending = false,
  sendError = null,
  placeholder = 'Message',
  autoFocus = true,
  maxLength,
  bottomInset = 0,
  testID,
  inputTestID = 'chat-composer-input',
  sendTestID = 'chat-composer-send',
}: ChatComposerProps): React.ReactNode {
  const inputRef = useRef<TextInput>(null);
  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !isSending;

  const handleSend = (): void => {
    if (!canSend) return;
    void hapticLight();
    onSend();
  };

  return (
    <View
      testID={testID}
      style={{ paddingBottom: bottomInset }}
      className="bg-white dark:bg-dark-surface border-t border-border dark:border-border-strong"
    >
      {sendError != null && (
        <View className="px-4 py-2 bg-red-50 dark:bg-error-bg">
          <Text className="text-[12px] text-red-600 dark:text-red-400">
            {sendError}
          </Text>
        </View>
      )}
      <View className="flex-row items-end gap-[8px] px-3 py-[8px]">
        <View className="flex-1 min-h-[36px] max-h-[120px] flex-row items-end pr-[6px] rounded-[18px] border border-[#e0e0e0] dark:border-border-strong bg-[#f8f9fa] dark:bg-dark-elevated">
          <TextInput
            testID={inputTestID}
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#999"
            className="flex-1 min-h-[36px] pl-[14px] py-[8px] text-[15px] text-text-default dark:text-content-primary"
            multiline
            keyboardType="default"
            autoComplete="off"
            textContentType="none"
            autoCapitalize="sentences"
            autoCorrect
            autoFocus={autoFocus}
            maxLength={maxLength}
            accessibilityLabel="Type a message"
          />
          <Pressable
            testID={sendTestID}
            onPress={handleSend}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send message"
            className={`w-[28px] h-[28px] rounded-full items-center justify-center my-[4px] ${
              canSend
                ? 'bg-[#1a3a4a] dark:bg-brand-teal active:opacity-80'
                : 'bg-[#cfd4d8] dark:bg-dark-elevated'
            }`}
          >
            {isSending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M12 20V5M6 11l6-6 6 6"
                  stroke="#fff"
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}
