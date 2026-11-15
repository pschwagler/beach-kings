import React from 'react';
import { act, fireEvent, render as testingRender, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Keyboard } from 'react-native';

const mockGetSessionById = jest.fn();
const mockGetCourts = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockUpdateSession = jest.fn();
const mockBack = jest.fn();
let mockKeyboardVisible = false;

jest.mock('@/hooks/useKeyboard', () => ({
  __esModule: true,
  default: () => ({ isVisible: mockKeyboardVisible, keyboardHeight: mockKeyboardVisible ? 300 : 0 }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack }),
  useLocalSearchParams: () => ({ id: '42' }),
}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) => <View testID={testID}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 34, left: 0, right: 0 }),
  };
});
jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    updateSession: (...args: unknown[]) => mockUpdateSession(...args),
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
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

import SessionEditRoute from '../../../../app/(stack)/session/[id]/edit';

function render(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return testingRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockKeyboardVisible = false;
  mockGetSessionById.mockResolvedValue({
    id: 42,
    code: null,
    league_id: 1,
    league_name: 'QBK Open Men',
    season_id: 10,
    court_id: 7,
    court_name: 'Ocean Beach',
    date: '2026-03-19',
    start_time: '3:00 PM',
    session_number: 3,
    status: 'active',
    session_type: 'league',
    is_ranked: false,
    players: [],
    games: [],
    user_wins: 0,
    user_losses: 0,
    user_rating_change: null,
  });
  mockGetCourts.mockResolvedValue([{ id: 7, name: 'Ocean Beach' }, { id: 8, name: 'Mission Bay' }]);
  mockGetLeagueSeasons.mockResolvedValue([{ id: 10, name: 'Spring 2026', is_active: true }]);
});

describe('SessionEditScreen', () => {
  it('exposes a high-contrast labelled close button', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => expect(screen.getByTestId('edit-session-season-10')).toBeTruthy());

    const close = screen.getByTestId('session-edit-close-btn');
    expect(close.props.accessibilityRole).toBe('button');
    expect(close.props.accessibilityLabel).toBe('Close edit session');
    expect(close).toHaveTextContent('✕');
  });

  it('shows the connected league and locks ranking for a season', async () => {
    render(<SessionEditRoute />);
    await waitFor(() =>
      expect(screen.getByTestId('edit-session-league-label')).toHaveTextContent(
        'QBK Open Men',
      ),
    );
    await waitFor(() => expect(screen.getByTestId('edit-session-season-10')).toBeTruthy());
    expect(screen.queryByText('Context')).toBeNull();
    expect(screen.getByTestId('edit-session-ranked-toggle').props.disabled).toBe(true);
    expect(screen.queryByTestId('edit-session-type-league')).toBeNull();
    expect(screen.getByTestId('edit-session-season-10').props.accessibilityRole).toBe('radio');
    expect(screen.getByTestId('edit-session-season-10').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('edit-session-season-none').props.accessibilityState.checked).toBe(false);
    fireEvent.press(screen.getByTestId('edit-session-season-none'));
    expect(screen.getByTestId('edit-session-season-none').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('edit-session-season-10').props.accessibilityState.checked).toBe(false);
  });

  it('allows long season and court names to wrap at accessibility text sizes', async () => {
    mockGetLeagueSeasons.mockResolvedValue([{ id: 10, name: 'A very long accessibility season name that needs more than one line', is_active: true }]);
    mockGetCourts.mockResolvedValue([{ id: 7, name: 'A very long accessibility court name that needs more than one line' }]);
    render(<SessionEditRoute />);

    const season = await screen.findByText('A very long accessibility season name that needs more than one line');
    const court = await screen.findByTestId('edit-session-selected-court');
    expect(season.props.numberOfLines).toBeUndefined();
    expect(court.props.numberOfLines).toBeUndefined();
  });

  it('omits the league/context block for pickup sessions', async () => {
    mockGetSessionById.mockResolvedValue({
      id: 42,
      code: null,
      league_id: null,
      league_name: null,
      season_id: null,
      court_id: 7,
      court_name: 'Ocean Beach',
      date: '2026-03-19',
      start_time: null,
      session_number: 3,
      status: 'active',
      session_type: 'pickup',
      is_ranked: true,
      players: [],
      games: [],
      user_wins: 0,
      user_losses: 0,
      user_rating_change: null,
    });

    render(<SessionEditRoute />);
    await waitFor(() =>
      expect(screen.getByTestId('edit-session-court-picker')).toBeTruthy(),
    );
    expect(screen.queryByTestId('edit-session-league-label')).toBeNull();
    expect(screen.queryByText('Context')).toBeNull();
  });

  it('selects a court by ID and includes is_ranked in the update payload', async () => {
    mockUpdateSession.mockResolvedValue({});
    render(<SessionEditRoute />);
    await waitFor(() => expect(screen.getByTestId('edit-session-season-10')).toBeTruthy());

    expect(screen.getByTestId('edit-session-court-picker').props.accessibilityLabel).toBe('Court');
    expect(screen.getByTestId('edit-session-court-picker').props.accessibilityValue)
      .toEqual({ text: 'Ocean Beach' });

    fireEvent.press(screen.getByTestId('edit-session-court-picker'));
    await waitFor(() => expect(screen.getByTestId('edit-session-court-option-8')).toBeTruthy());
    fireEvent.press(screen.getByTestId('edit-session-court-option-8'));

    await act(async () => { fireEvent.press(screen.getByTestId('session-edit-save-btn')); });
    expect(mockUpdateSession).toHaveBeenCalledWith(42, expect.objectContaining({
      court_id: 8,
      is_ranked: true,
      season_id: 10,
    }));
  });

  it('clears the selected court name when choosing no court', async () => {
    render(<SessionEditRoute />);
    await waitFor(() => expect(screen.getByTestId('edit-session-season-10')).toBeTruthy());

    fireEvent.press(screen.getByTestId('edit-session-court-picker'));
    await waitFor(() => expect(screen.getByTestId('edit-session-court-option-none')).toBeTruthy());
    fireEvent.press(screen.getByTestId('edit-session-court-option-none'));

    expect(screen.getByTestId('edit-session-selected-court').props.children).toBe('Select a court');
  });

  it('keeps actions reachable and preserves the time when dismissing the keyboard', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const view = render(<SessionEditRoute />);
    await waitFor(() => expect(screen.getByTestId('edit-session-season-10')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('edit-session-time-input'), '11:30 AM');

    mockKeyboardVisible = true;
    view.rerender(
      <QueryClientProvider client={new QueryClient()}><SessionEditRoute /></QueryClientProvider>,
    );

    expect(screen.getByTestId('session-edit-keyboard-avoider').props.automaticOffset).toBe(true);
    expect(screen.getByTestId('session-edit-actions')).toContainElement(screen.getByTestId('session-edit-save-btn'));
    expect(screen.getByTestId('session-edit-actions')).toContainElement(screen.getByTestId('session-edit-cancel-btn'));
    fireEvent.press(screen.getByLabelText('Dismiss keyboard'));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('edit-session-time-input').props.value).toBe('11:30 AM');
    dismiss.mockRestore();
  });

  it('preserves edits after a failed save and guards rapid retries', async () => {
    mockUpdateSession.mockRejectedValueOnce(new Error('Try again')).mockResolvedValueOnce({});
    render(<SessionEditRoute />);
    await waitFor(() => expect(screen.getByTestId('edit-session-season-10')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('edit-session-time-input'), '11:30 AM');

    fireEvent.press(screen.getByTestId('session-edit-save-btn'));
    await screen.findByText('Try again');
    expect(screen.getByTestId('edit-session-time-input').props.value).toBe('11:30 AM');
    fireEvent.press(screen.getByTestId('session-edit-save-btn'));
    fireEvent.press(screen.getByTestId('session-edit-save-btn'));

    await waitFor(() => expect(mockUpdateSession).toHaveBeenCalledTimes(2));
    expect(mockUpdateSession).toHaveBeenLastCalledWith(42, expect.objectContaining({ start_time: '11:30 AM' }));
  });
});
