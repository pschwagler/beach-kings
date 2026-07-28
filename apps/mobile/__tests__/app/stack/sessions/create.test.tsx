import React from 'react';
import {
  act,
  fireEvent,
  render as testingRender,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateSession = jest.fn();
const mockInviteSessionPlayers = jest.fn();
const mockGetCourts = jest.fn();
const mockGetLeague = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockReplace = jest.fn();
const mockLocalSearchParams = jest.fn(() => ({}));
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
  useLocalSearchParams: () => mockLocalSearchParams(),
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
    inviteSessionPlayers: (...args: unknown[]) => mockInviteSessionPlayers(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
  },
}));
jest.mock('@/utils/haptics', () => ({ hapticMedium: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({ textTertiary: 'gray', textInverse: 'white', brandTeal: 'teal' }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));
jest.mock('@/hooks/useResolvedUserLocation', () => ({
  useResolvedUserLocation: () => ({
    coords: { latitude: 32.78, longitude: -117.23 },
    source: 'city',
    isResolving: false,
  }),
}));
jest.mock('@/components/ui/icons', () => ({
  CalendarIcon: () => null,
  ChevronLeftIcon: () => null,
  ChevronRightIcon: () => null,
}));

import SessionCreateRoute from '../../../../app/(stack)/session/create';

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return testingRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLocalSearchParams.mockReturnValue({});
  mockGetCourts.mockResolvedValue([{ id: 7, name: 'Ocean Beach' }]);
  mockGetLeague.mockResolvedValue({ id: 3, name: 'QBK Open Men' });
  mockGetLeagueSeasons.mockResolvedValue([]);
  mockInviteSessionPlayers.mockResolvedValue({ added: [], failed: [] });
});

describe('SessionCreateScreen', () => {
  it('defaults to the nearest court and omits pickup context', async () => {
    render(<SessionCreateRoute />);
    await waitFor(() =>
      expect(screen.getByTestId('session-selected-court')).toHaveTextContent(
        'Ocean Beach',
      ),
    );
    fireEvent.press(screen.getByTestId('session-court-picker'));
    await waitFor(() => expect(screen.getByTestId('session-court-option-7')).toBeTruthy());
    expect(screen.getByTestId('session-court-search').props.accessibilityLabel).toBe(
      'Search courts',
    );
    expect(screen.getByTestId('session-court-picker')).toBeTruthy();
    expect(screen.queryByTestId('session-context-label')).toBeNull();
    expect(screen.queryByTestId('session-league-label')).toBeNull();
    expect(screen.getByTestId('session-ranked-toggle')).toBeTruthy();
    expect(screen.queryByTestId('session-type-pickup')).toBeNull();
  });

  it('shows a friendly date and supports the calendar quick actions', () => {
    render(<SessionCreateRoute />);

    expect(screen.getByTestId('session-date-input')).toHaveTextContent('Today');
    fireEvent.press(screen.getByTestId('session-date-input'));
    expect(screen.getByTestId('session-date-input-sheet')).toBeTruthy();

    fireEvent.press(screen.getByTestId('session-date-input-tomorrow'));
    expect(screen.getByTestId('session-date-input-sheet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-date-input-done'));

    expect(screen.getByTestId('session-date-input')).toHaveTextContent('Tomorrow');
    expect(screen.queryByTestId('session-date-input-sheet')).toBeNull();
  });

  it('labels league sessions with the league name instead of context copy', async () => {
    mockLocalSearchParams.mockReturnValue({ leagueId: '3' });
    render(<SessionCreateRoute />);

    await waitFor(() =>
      expect(screen.getByTestId('session-league-label')).toHaveTextContent(
        'QBK Open Men',
      ),
    );
    expect(screen.queryByText('Context')).toBeNull();
  });

  it('selects an existing court and submits its ID', async () => {
    mockCreateSession.mockResolvedValue({ id: 99 });
    render(<SessionCreateRoute />);

    await waitFor(() =>
      expect(screen.getByTestId('session-selected-court')).toHaveTextContent(
        'Ocean Beach',
      ),
    );

    await act(async () => { fireEvent.press(screen.getByTestId('session-create-submit-btn')); });
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ court_id: 7 }));
  });

  it('attaches selected pickup players after creating the session', async () => {
    mockLocalSearchParams.mockReturnValue({ playerIds: '73,88,88,bad,-1' });
    mockCreateSession.mockResolvedValue({ id: 99 });
    mockInviteSessionPlayers.mockResolvedValue({ added: [73, 88], failed: [] });
    render(<SessionCreateRoute />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });

    await waitFor(() =>
      expect(mockInviteSessionPlayers).toHaveBeenCalledWith(99, [73, 88]),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(stack)/session/99');
  });

  it('retries roster attachment without creating a duplicate session', async () => {
    mockLocalSearchParams.mockReturnValue({ playerIds: '73,88' });
    mockCreateSession.mockResolvedValue({ id: 99 });
    mockInviteSessionPlayers
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValueOnce({ added: [73, 88], failed: [] });
    render(<SessionCreateRoute />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('session-create-error')).toHaveTextContent(
        'Network Error',
      ),
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    });
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());

    expect(mockCreateSession).toHaveBeenCalledTimes(1);
    expect(mockInviteSessionPlayers).toHaveBeenCalledTimes(2);
  });
});
