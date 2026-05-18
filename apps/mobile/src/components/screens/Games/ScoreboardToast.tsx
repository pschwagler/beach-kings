/**
 * ScoreboardToast — bottom-pill confirmation toast for the score screen.
 *
 * Displays a brand-teal pill anchored above the tab bar with a success-green
 * check icon, a message, and an optional gold "Share" action. Animates in
 * (fade + translate-up, 250 ms), lingers for 2500 ms, then fades out (250 ms)
 * and calls `onDismiss`. Matches the `.toast-preview` block in
 * mobile-audit/wireframes/score-add-guest.html.
 */

import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { CheckIcon, ShareIcon } from '@/components/ui/icons';

interface ScoreboardToastProps {
  readonly visible: boolean;
  readonly message: string;
  readonly onShare?: () => void;
  readonly onDismiss: () => void;
}

const FADE_IN_MS = 250;
const LINGER_MS = 2500;
const FADE_OUT_MS = 250;

/** Icon size inside the success circle badge. */
const CHECK_ICON_SIZE = 14;
/** Icon size for the share action. */
const SHARE_ICON_SIZE = 14;

export default function ScoreboardToast({
  visible,
  message,
  onShare,
  onDismiss,
}: ScoreboardToastProps): React.ReactNode {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    if (!visible) {
      opacity.value = 0;
      translateY.value = 12;
      return;
    }

    // Fade + translate-up on entry
    opacity.value = withTiming(1, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.ease),
    });
    translateY.value = withTiming(0, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.ease),
    });

    // After linger, fade out and call onDismiss
    opacity.value = withDelay(
      LINGER_MS,
      withTiming(0, { duration: FADE_OUT_MS }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      }),
    );
    translateY.value = withDelay(
      LINGER_MS,
      withTiming(12, { duration: FADE_OUT_MS }),
    );
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      testID="scoreboard-toast"
      style={[animatedStyle, { bottom: 16 + bottomInset, left: 16, right: 16, shadowColor: '#1a3a4a', shadowOpacity: 0.32, shadowRadius: 14, shadowOffset: { width: 0, height: 10 } }]}
      className="absolute flex-row items-center rounded-full bg-brand-teal px-3 py-3 gap-3"
      accessibilityLiveRegion="polite"
    >
      {/* Success check circle */}
      <View className="w-7 h-7 rounded-full bg-success items-center justify-center flex-shrink-0">
        <CheckIcon size={CHECK_ICON_SIZE} color="#ffffff" />
      </View>

      {/* Message */}
      <Text
        testID="scoreboard-toast-message"
        className="flex-1 text-white text-sm font-semibold"
        numberOfLines={1}
      >
        {message}
      </Text>

      {/* Optional share action */}
      {onShare != null && (
        <Pressable
          testID="scoreboard-toast-share"
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Share invite link"
          className="px-3 py-1.5 flex-shrink-0 flex-row items-center gap-1"
        >
          <ShareIcon size={SHARE_ICON_SIZE} color="#d4a843" />
          <Text className="text-brand-gold text-xs font-bold uppercase tracking-widest">
            Share
          </Text>
        </Pressable>
      )}
    </Animated.View>
  );
}
