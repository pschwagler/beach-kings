/**
 * Tracks keyboard visibility and height using React Native's Keyboard API.
 *
 * Useful for adjusting layout or scroll position when the software keyboard
 * slides in or out.
 */
import { useState, useEffect } from 'react';
import { Keyboard, KeyboardEvent } from 'react-native';

interface UseKeyboardResult {
  /** Whether the software keyboard is currently visible. */
  isVisible: boolean;
  /** Current keyboard height in logical pixels (0 when hidden). */
  keyboardHeight: number;
}

/**
 * Returns live keyboard visibility and height state.
 *
 * Subscribes to `keyboardDidShow` / `keyboardDidHide` events and cleans
 * up the subscriptions on unmount.
 */
function useKeyboard(): UseKeyboardResult {
  const [isVisible, setIsVisible] = useState(() => Keyboard.isVisible());
  const [keyboardHeight, setKeyboardHeight] = useState(() => Keyboard.metrics()?.height ?? 0);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      'keyboardDidShow',
      (event: KeyboardEvent) => {
        setIsVisible(true);
        setKeyboardHeight(event.endCoordinates.height);
      },
    );

    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setIsVisible(false);
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return { isVisible, keyboardHeight };
}

export default useKeyboard;
