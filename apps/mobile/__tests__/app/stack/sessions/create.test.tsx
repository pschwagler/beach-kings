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
const mockGetCurrentUserPlayer = jest.fn();
const mockGetPlayerHomeCourts = jest.fn();
const mockGetPlaceholderCourt = jest.fn();
const mockGetLocations = jest.fn();
const mockUpdatePlayerProfile = jest.fn();
const mockUseResolvedUserLocation = jest.fn(() => ({
  coords: { latitude: 32.78, longitude: -117.23 },
  source: 'city',
  isResolving: false,
}));
const mockReplace = jest.fn();
const mockLocalSearchParams = jest.fn(() => ({}));
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
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getPlayerHomeCourts: (...args: unknown[]) => mockGetPlayerHomeCourts(...args),
    getPlaceholderCourt: (...args: unknown[]) => mockGetPlaceholderCourt(...args),
    getLocations: (...args: unknown[]) => mockGetLocations(...args),
    updatePlayerProfile: (...args: unknown[]) => mockUpdatePlayerProfile(...args),
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
  useResolvedUserLocation: () => mockUseResolvedUserLocation(),
}));
jest.mock('@/components/ui/icons', () => ({
  CalendarIcon: () => null,
  ChevronLeftIcon: () => null,
  ChevronRightIcon: () => null,
}));
jest.mock('@/components/forms/BottomSheetSelect', () => {
  const React = require('react');
  const { Pressable, Text } = require('react-native');
  return function MockBottomSheetSelect({ testID, placeholder, options, onChange }: any) {
    return (
      <Pressable testID={testID} onPress={() => options[0] && onChange(options[0].value)}>
        <Text>{placeholder}</Text>
      </Pressable>
    );
  };
});

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
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 44, location_id: 'montreal' });
  mockGetPlayerHomeCourts.mockResolvedValue([{ id: 8, name: 'Home Beach', position: 0 }]);
  mockGetPlaceholderCourt.mockResolvedValue({ id: 90, name: 'Other / Private Court' });
  mockGetLocations.mockResolvedValue([
    { id: 'montreal', city: 'Montreal', state: 'Quebec', name: 'Montreal' },
  ]);
  mockUpdatePlayerProfile.mockImplementation(async (updates) => ({ id: 44, ...updates }));
  mockInviteSessionPlayers.mockResolvedValue({ added: [], failed: [] });
});

describe('SessionCreateScreen', () => {
  it('suggests the first home court instead of the nearest catalog court', async () => {
    render(<SessionCreateRoute />);
    await waitFor(() =>
      expect(screen.getByTestId('session-selected-court')).toHaveTextContent(
        'Home Beach',
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
    expect(screen.getByTestId('session-confirm-court')).toBeTruthy();
    expect(screen.queryByTestId('session-type-pickup')).toBeNull();
    expect(mockUseResolvedUserLocation).not.toHaveBeenCalled();
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
        'Home Beach',
      ),
    );

    fireEvent.press(screen.getByTestId('session-court-picker'));
    fireEvent.press(await screen.findByTestId('session-court-option-7'));

    await act(async () => { fireEvent.press(screen.getByTestId('session-create-submit-btn')); });
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ court_id: 7 }));
  });

  it('does not create from an unconfirmed suggestion', async () => {
    render(<SessionCreateRoute />);
    await screen.findByTestId('session-confirm-court');

    fireEvent.press(screen.getByTestId('session-create-submit-btn'));

    expect(await screen.findByText(/Confirm the suggested court/)).toBeTruthy();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('uses the metro private court when no home court exists', async () => {
    mockGetPlayerHomeCourts.mockResolvedValueOnce([]);
    render(<SessionCreateRoute />);

    expect(await screen.findByText('Other / Private Court')).toBeTruthy();
    expect(mockGetPlaceholderCourt).toHaveBeenCalledWith('montreal');
  });

  it('asks for a named metro when neither a home court nor metro exists', async () => {
    mockGetCurrentUserPlayer.mockResolvedValueOnce({ id: 44, location_id: null });
    mockGetPlayerHomeCourts.mockResolvedValueOnce([]);
    render(<SessionCreateRoute />);

    expect(await screen.findByText('Choose your metro')).toBeTruthy();
    expect(screen.getByTestId('session-metro-picker')).toBeTruthy();
    fireEvent.press(screen.getByTestId('session-create-submit-btn'));
    expect(await screen.findByText(/Choose a metro before/)).toBeTruthy();
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it('saves the selected metro before suggesting its private court', async () => {
    mockGetCurrentUserPlayer.mockResolvedValueOnce({ id: 44, location_id: null });
    mockGetPlayerHomeCourts.mockResolvedValueOnce([]);
    render(<SessionCreateRoute />);

    fireEvent.press(await screen.findByTestId('session-metro-picker'));

    await waitFor(() => {
      expect(mockUpdatePlayerProfile).toHaveBeenCalledWith({
        location_id: 'montreal',
        city: 'Montreal',
        state: 'Quebec',
      });
    });
    expect(await screen.findByText('Other / Private Court')).toBeTruthy();
    expect(screen.getByTestId('session-confirm-court')).toBeTruthy();
  });

  it('shows a retryable error when the required home-court suggestion fails', async () => {
    mockGetPlayerHomeCourts
      .mockRejectedValueOnce(new Error('home courts unavailable'))
      .mockResolvedValueOnce([{ id: 8, name: 'Home Beach', position: 0 }]);
    render(<SessionCreateRoute />);

    expect(await screen.findByText('Your home-court suggestion could not be loaded.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry loading this section'));
    expect(await screen.findByText('Home Beach')).toBeTruthy();
  });

  it('recovers when the required metro catalog fails', async () => {
    mockGetCurrentUserPlayer.mockResolvedValueOnce({ id: 44, location_id: null });
    mockGetPlayerHomeCourts.mockResolvedValueOnce([]);
    mockGetLocations
      .mockRejectedValueOnce(new Error('metros unavailable'))
      .mockResolvedValueOnce([
        { id: 'montreal', city: 'Montreal', state: 'Quebec', name: 'Montreal' },
      ]);
    render(<SessionCreateRoute />);

    expect(await screen.findByText('Available metros could not be loaded.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Retry loading this section'));

    await waitFor(() => {
      expect(mockGetLocations).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('Available metros could not be loaded.')).toBeNull();
    });
    expect(screen.getByTestId('session-metro-picker')).toHaveTextContent('Select metro');
  });

  it('attaches selected pickup players after creating the session', async () => {
    mockLocalSearchParams.mockReturnValue({ playerIds: '73,88,88,bad,-1' });
    mockCreateSession.mockResolvedValue({ id: 99 });
    mockInviteSessionPlayers.mockResolvedValue({ added: [73, 88], failed: [] });
    render(<SessionCreateRoute />);

    fireEvent.press(await screen.findByTestId('session-confirm-court'));

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

    fireEvent.press(await screen.findByTestId('session-confirm-court'));

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
