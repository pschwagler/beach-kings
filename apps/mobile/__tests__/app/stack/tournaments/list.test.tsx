import React from 'react';
import { render, screen } from '@testing-library/react-native';
import TournamentsRoute from '../../../../app/(stack)/tournaments';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
  useSegments: () => ['(stack)', 'tournaments'],
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/components/ui/icons', () => ({ ChevronLeftIcon: () => null }));

it('renders an explicit unavailable state instead of tournament fixture data', () => {
  render(<TournamentsRoute />);
  expect(screen.getByText('Tournament browsing and management are coming soon.')).toBeTruthy();
  expect(screen.queryByText('Spring King of the Beach')).toBeNull();
});
