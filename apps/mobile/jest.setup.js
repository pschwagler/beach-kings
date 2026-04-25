// Jest setup for React Native Testing Library
import '@testing-library/jest-native/extend-expect';

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
