import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the operating-system Reduce Motion preference.
 *
 * The setting is queried on mount and kept current through the native event.
 * A failed query safely falls back to normal motion; consumers should use the
 * returned value to remove or make state-change animations instantaneous.
 */
export function useReducedMotion(): boolean {
  const [isReducedMotionEnabled, setIsReducedMotionEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;

    const handleChange = (enabled: boolean) => {
      if (mounted) setIsReducedMotionEnabled(enabled);
    };

    void AccessibilityInfo.isReduceMotionEnabled()
      .then(handleChange)
      .catch(() => {
        // Accessibility state is best-effort on unsupported platforms.
      });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      handleChange,
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return isReducedMotionEnabled;
}
