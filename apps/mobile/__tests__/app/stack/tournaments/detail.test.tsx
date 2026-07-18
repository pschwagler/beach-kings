import React from 'react';
import { render, screen } from '@testing-library/react-native';
import TournamentDetailRoute from '../../../../app/(stack)/tournament/[id]';

jest.mock('expo-router', () => ({
  useRouter: () => ({ canGoBack: () => false, back: jest.fn(), replace: jest.fn() }),
  useSegments: () => ['(stack)', 'tournament', '[id]'],
  useLocalSearchParams: () => ({ id: '1' }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children?: React.ReactNode }) => <View>{children}</View> };
});

jest.mock('@/components/ui/icons', () => ({ ChevronLeftIcon: () => null }));

it('renders an explicit unavailable state', () => {
  render(<TournamentDetailRoute />);
  expect(screen.getByText('Tournament details are not available yet.')).toBeTruthy();
});
