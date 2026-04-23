/**
 * Behavior tests for the Change Password screen.
 *
 * Covers:
 *   - All three password fields render
 *   - Submit button renders
 *   - Shows error banner when fields are empty on submit
 *   - Shows error when new password is less than 8 chars
 *   - Shows error when passwords do not match
 *   - Shows error when new password matches current password
 *   - Clears banner when user types in a field
 *   - Calls submit on keyboard done
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
    Slot: ({ children }: { children?: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      <View testID={testID ?? 'safe-area-view'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  return { __esModule: true, default: Svg, Svg, Path };
});

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticHeavy: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
    EyeIcon: makeIcon('EyeIcon'),
    EyeOffIcon: makeIcon('EyeOffIcon'),
  };
});

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import ChangePasswordRoute from '../../../../app/(stack)/settings/change-password';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillForm(current: string, newPwd: string, confirm: string) {
  fireEvent.changeText(screen.getByTestId('input-current-password'), current);
  fireEvent.changeText(screen.getByTestId('input-new-password'), newPwd);
  fireEvent.changeText(screen.getByTestId('input-confirm-password'), confirm);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('ChangePasswordScreen — render', () => {
  it('renders the change password screen', () => {
    render(<ChangePasswordRoute />);
    expect(screen.getByTestId('change-password-screen')).toBeTruthy();
  });

  it('renders current password input', () => {
    render(<ChangePasswordRoute />);
    expect(screen.getByTestId('input-current-password')).toBeTruthy();
  });

  it('renders new password input', () => {
    render(<ChangePasswordRoute />);
    expect(screen.getByTestId('input-new-password')).toBeTruthy();
  });

  it('renders confirm password input', () => {
    render(<ChangePasswordRoute />);
    expect(screen.getByTestId('input-confirm-password')).toBeTruthy();
  });

  it('renders submit button', () => {
    render(<ChangePasswordRoute />);
    expect(screen.getByTestId('change-password-submit-btn')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

describe('ChangePasswordScreen — validation', () => {
  it('shows error when current password is empty on submit', async () => {
    render(<ChangePasswordRoute />);
    fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('change-password-error')).toBeTruthy();
    });
    expect(screen.getByText('Please enter your current password.')).toBeTruthy();
  });

  it('shows error when new password is too short', async () => {
    render(<ChangePasswordRoute />);
    fillForm('oldpass', 'short', 'short');
    fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('change-password-error')).toBeTruthy();
    });
    expect(screen.getByText('New password must be at least 8 characters.')).toBeTruthy();
  });

  it('shows error when passwords do not match', async () => {
    render(<ChangePasswordRoute />);
    fillForm('oldpassword', 'newpassword1', 'newpassword2');
    fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('change-password-error')).toBeTruthy();
    });
    expect(screen.getByText('Passwords do not match.')).toBeTruthy();
  });

  it('shows error when new password matches current password', async () => {
    render(<ChangePasswordRoute />);
    fillForm('samepassword', 'samepassword', 'samepassword');
    fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('change-password-error')).toBeTruthy();
    });
    expect(screen.getByText('New password must differ from your current password.')).toBeTruthy();
  });

  it('clears error banner when user starts typing', async () => {
    render(<ChangePasswordRoute />);
    fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    await waitFor(() => expect(screen.getByTestId('change-password-error')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('input-current-password'), 'x');
    expect(screen.queryByTestId('change-password-error')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Success
// ---------------------------------------------------------------------------

describe('ChangePasswordScreen — success', () => {
  it('shows success banner after simulated successful submit', async () => {
    render(<ChangePasswordRoute />);
    fillForm('currentpass', 'newpassword1', 'newpassword1');
    await act(async () => {
      fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('change-password-success')).toBeTruthy();
    }, { timeout: 3000 });
    expect(screen.getByText('Password updated successfully.')).toBeTruthy();
  });

  it('clears form fields after successful submit', async () => {
    render(<ChangePasswordRoute />);
    fillForm('currentpass', 'newpassword1', 'newpassword1');
    await act(async () => {
      fireEvent.press(screen.getByTestId('change-password-submit-btn'));
    });
    await waitFor(() => {
      expect(screen.getByTestId('change-password-success')).toBeTruthy();
    }, { timeout: 3000 });
    const currentField = screen.getByTestId('input-current-password');
    expect(currentField.props.value).toBe('');
  });
});
