import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, canGoBack: () => true }),
  useSegments: () => ['(stack)', 'settings', 'support'],
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => (
      <View testID={testID}>{children}</View>
    ),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#00796f',
    textMuted: '#596568',
    textTertiary: '#7b8587',
    textInverse: '#ffffff',
  }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
}));

import SupportRoute from '../../../../app/(stack)/settings/support';
import { PUBLIC_URLS } from '@/lib/publicUrls';

const mockCanOpenURL = jest.spyOn(Linking, 'canOpenURL');
const mockOpenURL = jest.spyOn(Linking, 'openURL');

describe('Support screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(true);
  });

  it('renders contact guidance and policy destinations', () => {
    render(<SupportRoute />);

    expect(screen.getByTestId('support-screen')).toBeTruthy();
    expect(screen.getByText('We’re here to help.')).toBeTruthy();
    expect(screen.getByText('beachleaguevb+support@gmail.com')).toBeTruthy();
    expect(screen.getByTestId('support-community-guidelines')).toBeTruthy();
    expect(screen.getByTestId('support-terms')).toBeTruthy();
    expect(screen.getByTestId('support-privacy')).toBeTruthy();
  });

  it('opens an email draft only after the user chooses email support', async () => {
    render(<SupportRoute />);
    fireEvent.press(screen.getByTestId('support-email'));

    await waitFor(() => {
      expect(mockOpenURL).toHaveBeenCalledWith(
        expect.stringContaining('mailto:beachleaguevb+support@gmail.com'),
      );
    });
  });

  it('opens the in-app feedback form', () => {
    render(<SupportRoute />);
    fireEvent.press(screen.getByTestId('support-feedback'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings/feedback');
  });

  it('uses the deployment-derived URL for policy links', async () => {
    render(<SupportRoute />);
    fireEvent.press(screen.getByTestId('support-terms'));

    await waitFor(() => {
      expect(mockOpenURL).toHaveBeenCalledWith(PUBLIC_URLS.terms);
    });
  });
});
