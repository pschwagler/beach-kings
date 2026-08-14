import React from 'react';
import { render as renderTestingLibrary, screen } from '@testing-library/react-native';
import TournamentCreateRoute from '../../../../app/(stack)/tournament/create';
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
  useSegments: () => ['(stack)', 'tournament', 'create'],
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/components/ui/icons', () => ({ ChevronLeftIcon: () => null }));

it('renders an explicit unavailable state', () => {
  render(<TournamentCreateRoute />);
  expect(screen.getByText('Tournament creation is not available yet.')).toBeTruthy();
});
