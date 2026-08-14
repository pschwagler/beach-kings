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
import AppText from '@/components/ui/AppText';
import { Pressable, View } from 'react-native';
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
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePaletteColors } from '@/theme/usePaletteColors';

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
  const reduceMotion = useReducedMotion();
  const palette = usePaletteColors();
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    if (!visible) {
      opacity.value = 0;
      translateY.value = 12;
      return;
    }

    if (reduceMotion) {
      opacity.value = 1;
      translateY.value = 0;
      const timeout = setTimeout(onDismiss, LINGER_MS);
      return () => clearTimeout(timeout);
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
  }, [onDismiss, opacity, reduceMotion, translateY, visible]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (!visible) return null;

  return (
    <Animated.View
      testID="scoreboard-toast"
      style={[animatedStyle, { bottom: 16 + bottomInset, left: 16, right: 16 }]}
      className="absolute flex-row items-center rounded-full bg-brand-teal px-3 py-3 gap-3 shadow-lg"
      accessibilityLiveRegion="polite"
    >
      {/* Success check circle */}
      <View className="w-7 h-7 rounded-full bg-success-fill items-center justify-center flex-shrink-0">
        <CheckIcon size={CHECK_ICON_SIZE} color={palette.onSuccess} />
      </View>

      {/* Message */}
      <AppText
        testID="scoreboard-toast-message"
        className="flex-1 text-on-brand-teal text-sm font-semibold"
        numberOfLines={1}
      >
        {message}
      </AppText>

      {/* Optional share action */}
      {onShare != null && (
        <Pressable
          testID="scoreboard-toast-share"
          onPress={onShare}
          accessibilityRole="button"
          accessibilityLabel="Invite player to the Beach League app"
          className="px-3 py-1.5 flex-shrink-0 flex-row items-center gap-1"
        >
          <ShareIcon size={SHARE_ICON_SIZE} color={palette.onBrandTeal} />
          <AppText className="text-on-brand-teal text-xs font-bold uppercase tracking-widest">
            Invite
          </AppText>
        </Pressable>
      )}
    </Animated.View>
  );
}
