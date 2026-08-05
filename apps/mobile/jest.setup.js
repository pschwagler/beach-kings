// Jest setup for React Native Testing Library
import '@testing-library/jest-native/extend-expect';
import { act } from '@testing-library/react-native';
import { notifyManager, timeoutManager } from '@tanstack/react-query';

// TanStack Query batches observer notifications on a timer. Route those
// notifications through React's test boundary so async cache updates do not
// escape the assertions that triggered them.
notifyManager.setNotifyFunction((callback) => {
  act(callback);
});

// Query cache GC/retry timers should behave normally in tests without keeping
// the Jest worker alive after every rendered provider has been unmounted.
// Individual tests may create their own QueryClient, so this belongs at the
// shared timeout-provider boundary rather than in one client factory.
const unrefTimer = (timer) => {
  timer?.unref?.();
  return timer;
};

timeoutManager.setTimeoutProvider({
  setTimeout: (callback, delay) =>
    unrefTimer(setTimeout(callback, delay)),
  clearTimeout: (timer) => clearTimeout(timer),
  setInterval: (callback, delay) =>
    unrefTimer(setInterval(callback, delay)),
  clearInterval: (timer) => clearInterval(timer),
});


// Mock expo-auth-session Google provider — tests run without client IDs.
jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: () => [
    { url: 'https://example.test/auth' },
    null,
    jest.fn(async () => ({ type: 'cancel' })),
  ],
}));

// Mock expo-web-browser — the auth session helper is a no-op in tests.
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

// Mock expo-apple-authentication — sheet isn't available in tests.
jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => false),
  signInAsync: jest.fn(async () => {
    throw Object.assign(new Error('cancelled'), { code: 'ERR_REQUEST_CANCELED' });
  }),
  AppleAuthenticationScope: {
    FULL_NAME: 'fullName',
    EMAIL: 'email',
  },
}));

// Mock @react-native-community/datetimepicker — native module unavailable
// in Jest. Render null so picker openings don't explode tests.
jest.mock('@react-native-community/datetimepicker', () => {
  const React = require('react');
  return { __esModule: true, default: () => null };
});

// Mock react-native-gesture-handler — native touch infrastructure not available in Jest.
jest.mock('react-native-gesture-handler', () => {
  const React = require('react');
  const { View } = require('react-native');

  function makePanGesture() {
    const g = {
      activateAfterLongPress: () => g,
      minDistance: () => g,
      onStart: () => g,
      onChange: () => g,
      onEnd: () => g,
      onFinalize: () => g,
      enabled: () => g,
      simultaneousWithExternalGesture: () => g,
    };
    return g;
  }

  return {
    __esModule: true,
    GestureDetector: ({ children }) => children,
    GestureHandlerRootView: ({ children, ...props }) =>
      React.createElement(View, props, children),
    Gesture: {
      Pan: makePanGesture,
      Tap: makePanGesture,
      LongPress: makePanGesture,
      Simultaneous: (...gestures) => gestures[0],
      Race: (...gestures) => gestures[0],
    },
  };
});

// Mock react-native-keyboard-controller — native module unavailable in Jest.
// KeyboardProvider and KeyboardStickyView render their children as plain views.
jest.mock('react-native-keyboard-controller', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Passthrough = ({ children, ...rest }) =>
    React.createElement(View, rest, children);
  return {
    KeyboardProvider: Passthrough,
    KeyboardStickyView: Passthrough,
    KeyboardAvoidingView: Passthrough,
    KeyboardAwareScrollView: Passthrough,
    useKeyboardHandler: () => undefined,
    useReanimatedKeyboardAnimation: () => ({ height: { value: 0 }, progress: { value: 0 } }),
  };
});
