import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

const mockCreateSession = jest.fn();
const mockGetCourts = jest.fn();
const mockReplace = jest.fn();
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => <View testID={testID}>{children}</View> };
});
jest.mock('@/lib/api', () => ({
  api: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
  },
}));
jest.mock('@/utils/haptics', () => ({ hapticMedium: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textTertiary: 'gray', textInverse: 'white', brandTeal: 'teal' }),
}));
jest.mock('@/components/ui/icons', () => ({ ChevronLeftIcon: () => null }));

import SessionCreateRoute from '../../../../app/(stack)/session/create';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCourts.mockResolvedValue([{ id: 7, name: 'Ocean Beach' }]);
});

describe('SessionCreateScreen', () => {
  it('renders court selection, derived pickup context, and ranked toggle', async () => {
    render(<SessionCreateRoute />);
    fireEvent.press(screen.getByTestId('session-court-picker'));
    await waitFor(() => expect(screen.getByTestId('session-court-option-7')).toBeTruthy());
    expect(screen.getByTestId('session-court-picker')).toBeTruthy();
    expect(screen.getByTestId('session-context-label').props.children).toBe('Pickup session');
    expect(screen.getByTestId('session-ranked-toggle')).toBeTruthy();
    expect(screen.queryByTestId('session-type-pickup')).toBeNull();
  });

  it('selects an existing court and submits its ID', async () => {
    mockCreateSession.mockResolvedValue({ id: 99 });
    render(<SessionCreateRoute />);

    fireEvent.press(screen.getByTestId('session-court-picker'));
    await waitFor(() => expect(screen.getByTestId('session-court-option-7')).toBeTruthy());
    fireEvent.press(screen.getByTestId('session-court-option-7'));
    expect(screen.getByTestId('session-selected-court').props.children).toBe('Ocean Beach');

    await act(async () => { fireEvent.press(screen.getByTestId('session-create-submit-btn')); });
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ court_id: 7 }));
  });
});
