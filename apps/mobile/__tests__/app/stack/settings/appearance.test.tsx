/**
 * Behavior tests for the Appearance settings screen.
 *
 * Covers:
 *   - Renders three theme options (System, Light, Dark)
 *   - Active option shows a checkmark
 *   - Selecting an option calls setThemeMode
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockSetThemeMode = jest.fn();
let mockThemeMode: 'light' | 'dark' | 'system' = 'system';

jest.mock('expo-router', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    useRouter: () => ({ push: jest.fn(), back: mockBack }),
    useLocalSearchParams: () => ({}),
    Redirect: ({ href }: { href: string }) => <View testID={`redirect-${href}`} />,
    useSegments: () => [],
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

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colorScheme: 'light',
    themeMode: mockThemeMode,
    setThemeMode: mockSetThemeMode,
  }),
}));

jest.mock('@/components/ui/icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const makeIcon = (name: string) => (_props: unknown) => <View testID={`icon-${name}`} />;
  return {
    ArrowLeftIcon: makeIcon('ArrowLeftIcon'),
    ChevronLeftIcon: makeIcon('ChevronLeftIcon'),
  };
});

import AppearanceRoute from '../../../../app/(stack)/settings/appearance';

beforeEach(() => {
  jest.clearAllMocks();
  mockThemeMode = 'system';
});

describe('AppearanceSettingsScreen — render', () => {
  it('renders the appearance screen', () => {
    render(<AppearanceRoute />);
    expect(screen.getByTestId('appearance-settings-screen')).toBeTruthy();
  });

  it('renders all three theme options', () => {
    render(<AppearanceRoute />);
    expect(screen.getByTestId('appearance-option-system')).toBeTruthy();
    expect(screen.getByTestId('appearance-option-light')).toBeTruthy();
    expect(screen.getByTestId('appearance-option-dark')).toBeTruthy();
  });

  it('shows checkmark next to the active option', () => {
    mockThemeMode = 'dark';
    render(<AppearanceRoute />);
    expect(screen.getByTestId('appearance-option-dark-check')).toBeTruthy();
    expect(screen.queryByTestId('appearance-option-light-check')).toBeNull();
    expect(screen.queryByTestId('appearance-option-system-check')).toBeNull();
  });
});

describe('AppearanceSettingsScreen — selection', () => {
  it('calls setThemeMode("light") when Light is pressed', () => {
    render(<AppearanceRoute />);
    fireEvent.press(screen.getByTestId('appearance-option-light'));
    expect(mockSetThemeMode).toHaveBeenCalledWith('light');
  });

  it('calls setThemeMode("dark") when Dark is pressed', () => {
    render(<AppearanceRoute />);
    fireEvent.press(screen.getByTestId('appearance-option-dark'));
    expect(mockSetThemeMode).toHaveBeenCalledWith('dark');
  });

  it('calls setThemeMode("system") when System is pressed', () => {
    mockThemeMode = 'light';
    render(<AppearanceRoute />);
    fireEvent.press(screen.getByTestId('appearance-option-system'));
    expect(mockSetThemeMode).toHaveBeenCalledWith('system');
  });
});
