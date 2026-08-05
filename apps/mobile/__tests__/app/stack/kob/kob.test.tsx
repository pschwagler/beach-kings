import React from 'react';
import { render as renderTestingLibrary, screen } from '@testing-library/react-native';
import KobRoute from '../../../../app/(stack)/kob/[code]';
import ThemeProvider from '@/contexts/ThemeContext';

function render(ui: React.ReactElement): ReturnType<typeof renderTestingLibrary> {
  return renderTestingLibrary(<ThemeProvider>{ui}</ThemeProvider>);
}

jest.mock('nativewind', () => ({
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: jest.fn() }),
  vars: (values: object) => values,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
  useSegments: () => ['(stack)', 'kob', '[code]'],
  useLocalSearchParams: () => ({ code: 'MB2026' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/components/ui/icons', () => ({ ChevronLeftIcon: () => null }));

it('renders an explicit unavailable state instead of KoB fixture data', () => {
  render(<KobRoute />);
  expect(screen.getByText('King of the Beach tournaments are coming soon.')).toBeTruthy();
  expect(screen.queryByText('Spring King of the Beach')).toBeNull();
});
