/**
 * ChatComposer — shared input bar for chat surfaces (DM threads, league chat).
 *
 * Pin to the keyboard with `<KeyboardStickyView offset={...}>` from
 * `react-native-keyboard-controller` in the parent. This component handles only
 * the visuals + behavior of the composer row itself (pill input + iMessage-style
 * up-arrow send button).
 */

import React, { useRef } from 'react';
import { View, TextInput, Pressable, ActivityIndicator } from 'react-native';
import AppText from '@/components/ui/AppText';
import Svg, { Path } from 'react-native-svg';
import { hapticLight } from '@/utils/haptics';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  autoFocus = false,
  maxLength,
  bottomInset = 0,
  testID,
  inputTestID = 'chat-composer-input',
  sendTestID = 'chat-composer-send',
}: ChatComposerProps): React.ReactNode {
  const palette = usePaletteColors();
  const inputRef = useRef<TextInput>(null);
  const trimmed = value.trim();
  const hasMessage = trimmed.length > 0;
  const canSend = hasMessage && !isSending;
  // Keep the class set stable while typing. NativeWind v4/css-interop can
  // crash when a controlled TextInput re-render swaps utility-driven
  // background styles, surfacing a misleading React Navigation context error.
  // Plain RN style is safe here and still uses the active semantic palette.
  const sendButtonStyle = {
    backgroundColor: hasMessage ? palette.brandTeal : palette.bgElevated,
  };

  const handleSend = (): void => {
    if (!canSend) return;
    void hapticLight();
    onSend();
  };

  return (
    <View
      testID={testID}
      style={{ paddingBottom: bottomInset }}
      className="bg-surface border-t border-divider"
    >
      {sendError != null && (
        <View className="px-4 py-2 bg-danger-tint">
          <AppText
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="text-[12px] text-danger"
          >
            {sendError}
          </AppText>
        </View>
      )}
      <View className="flex-row items-end gap-[8px] px-3 py-[8px]">
        <View className="max-h-[120px] min-h-touch flex-1 flex-row items-end rounded-[22px] border border-divider bg-elevated pr-1">
          <TextInput
            testID={inputTestID}
            ref={inputRef}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={palette.textTertiary}
            className="min-h-touch flex-1 py-[10px] pl-[14px] text-[15px] text-default"
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
            accessibilityState={{ disabled: !canSend, busy: isSending }}
            className="min-h-touch min-w-touch items-center justify-center active:opacity-80"
          >
            <View
              testID={`${sendTestID}-surface`}
              className="h-7 w-7 items-center justify-center rounded-full"
              style={sendButtonStyle}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={palette.onBrandTeal} />
              ) : (
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M12 20V5M6 11l6-6 6 6"
                    stroke={
                      canSend ? palette.onBrandTeal : palette.textTertiary
                    }
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              )}
            </View>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
