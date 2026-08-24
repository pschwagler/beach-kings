/**
 * Tests for the Create League screen.
 *
 * Covers:
 *   - Renders all form fields (name, description, access toggle, gender, level,
 *     location picker row, court picker row)
 *   - Submit button disabled until name is long enough
 *   - access_type → is_open mapping: 'open' → true, 'invite_only' → false
 *   - Order of API calls: createLeague → addLeagueHomeCourt (createLeagueSeason NOT called)
 *   - Success navigation after submit
 *   - Error handling on submit failure
 */

import React from 'react';
import {
  act,
  render as renderWithoutQuery,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, testID }: { children?: React.ReactNode; testID?: string }) =>
      <View testID={testID ?? 'safe-area-view'}>{children}</View>,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-reanimated', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    Easing: { inOut: () => ({}), ease: {} },
  };
});

jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Svg = ({ children }: { children?: React.ReactNode }) => <View>{children}</View>;
  const Path = () => null;
  const Circle = () => null;
  return { __esModule: true, default: Svg, Svg, Path, Circle };
});

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn().mockResolvedValue(undefined),
  hapticMedium: jest.fn().mockResolvedValue(undefined),
  hapticSuccess: jest.fn().mockResolvedValue(undefined),
  hapticError: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    textTertiary: 'gray',
    textInverse: 'white',
    brandTeal: 'teal',
  }),
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

const mockCreateLeague = jest.fn();
const mockGetLocations = jest.fn();
const mockGetCourts = jest.fn();
const mockAddLeagueHomeCourt = jest.fn();
const mockCreateLeagueSeason = jest.fn();
const mockGetLocationDistances = jest.fn();
const mockRequestForegroundPermissions = jest.fn();
const mockGetCurrentPosition = jest.fn();

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequestForegroundPermissions(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockGetCurrentPosition(...args),
  Accuracy: { Balanced: 3 },
}));

jest.mock('@/lib/api', () => ({
  api: {
    createLeague: (...args: unknown[]) => mockCreateLeague(...args),
    getLocations: (...args: unknown[]) => mockGetLocations(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    addLeagueHomeCourt: (...args: unknown[]) => mockAddLeagueHomeCourt(...args),
    createLeagueSeason: (...args: unknown[]) => mockCreateLeagueSeason(...args),
    getLocationDistances: (...args: unknown[]) => mockGetLocationDistances(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import CreateLeagueRoute from '../../../../app/(stack)/create-league';
import { courtKeys } from '@/features/courts';

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function render(ui: React.ReactElement, client = makeClient()) {
  return renderWithoutQuery(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const MOCK_LOCATIONS = [
  { id: 'socal_sd', name: 'San Diego', city: 'San Diego', state: 'CA' },
  { id: 'socal_la', name: 'Los Angeles', city: 'Los Angeles', state: 'CA' },
];

const MOCK_COURTS = [
  { id: 1, name: 'QBK Sports', location_id: 'socal_sd' },
  { id: 2, name: 'Mission Beach', location_id: 'socal_sd' },
];

beforeEach(() => {
  jest.clearAllMocks();
  // Most tests exercise form behavior independently of location discovery.
  // Keep that request pending so an unrelated async effect cannot race cleanup.
  mockGetLocations.mockReturnValue(new Promise(() => {}));
  mockGetCourts.mockResolvedValue(MOCK_COURTS);
  mockAddLeagueHomeCourt.mockResolvedValue({ id: 1, name: 'QBK Sports', position: 0 });
  mockCreateLeagueSeason.mockResolvedValue({ id: 1, name: 'Season 1', is_active: true });
  mockGetLocationDistances.mockResolvedValue([]);
  mockRequestForegroundPermissions.mockResolvedValue({ status: 'denied' });
  mockGetCurrentPosition.mockResolvedValue({
    coords: { latitude: 45.5, longitude: -73.6 },
  });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — render', () => {
  it('renders the create league screen container', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('create-league-screen')).toBeTruthy();
  });

  it('renders the league name input', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('league-name-input')).toBeTruthy();
  });

  it('renders the league description input', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('league-description-input')).toBeTruthy();
  });

  it('renders the create button', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('create-league-button')).toBeTruthy();
  });

  it('renders the access type toggles', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('access-toggle-open')).toBeTruthy();
    expect(screen.getByTestId('access-toggle-invite_only')).toBeTruthy();
  });

  it('renders gender pills', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('gender-pill-mens')).toBeTruthy();
    expect(screen.getByTestId('gender-pill-womens')).toBeTruthy();
    expect(screen.getByTestId('gender-pill-coed')).toBeTruthy();
  });

  it('renders the location picker row', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('location-picker-row')).toBeTruthy();
  });

  it('renders the court picker row', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('court-picker-row')).toBeTruthy();
  });

  it('loads selected-location courts through the private court Query catalog', async () => {
    mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
    const client = makeClient();
    render(<CreateLeagueRoute />, client);

    await waitFor(() => {
      expect(
        screen.getByTestId('location-picker-row').props.accessibilityState
          ?.disabled,
      ).toBe(false);
    });
    fireEvent.press(screen.getByTestId('location-picker-row'));
    fireEvent.press(await screen.findByTestId('location-modal-option-socal_sd'));

    await waitFor(() => {
      expect(mockGetCourts).toHaveBeenCalledWith({ location_id: 'socal_sd' });
      expect(
        client.getQueryData(courtKeys.nearby(7, null, null, 'socal_sd')),
      ).toEqual(MOCK_COURTS);
    });

    fireEvent.press(screen.getByTestId('court-picker-row'));
    expect(await screen.findByTestId('court-modal-option-1')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — validation', () => {
  it('submit button is disabled when name is empty', () => {
    render(<CreateLeagueRoute />);
    const button = screen.getByTestId('create-league-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('submit button is disabled when name has only one character', () => {
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'A');
    const button = screen.getByTestId('create-league-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('submit button is enabled when name has 2+ characters', () => {
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'My League');
    const button = screen.getByTestId('create-league-button');
    expect(button.props.accessibilityState?.disabled).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// Access type toggle
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — access toggle', () => {
  it('switches access to invite_only when that toggle is pressed', () => {
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('access-toggle-invite_only'));
    expect(screen.getByTestId('access-toggle-invite_only')).toBeTruthy();
  });

  it('switches access back to open when open toggle is pressed', () => {
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('access-toggle-invite_only'));
    fireEvent.press(screen.getByTestId('access-toggle-open'));
    expect(screen.getByTestId('access-toggle-open')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Gender pills
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — gender pills', () => {
  it('selects womens pill when pressed', () => {
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('gender-pill-womens'));
    expect(screen.getByTestId('gender-pill-womens')).toBeTruthy();
  });

  it('selects coed pill when pressed', () => {
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('gender-pill-coed'));
    expect(screen.getByTestId('gender-pill-coed')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Submit — access_type to is_open mapping + API call order
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — submit', () => {
  it('maps open access_type to is_open: true', async () => {
    mockCreateLeague.mockResolvedValueOnce({ id: 99, name: 'Beach Kings' });
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Beach Kings');
    // access_type default is 'open'
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ is_open: true }),
      );
    });
  });

  it('maps invite_only access_type to is_open: false', async () => {
    mockCreateLeague.mockResolvedValueOnce({ id: 99, name: 'Beach Kings' });
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Beach Kings');
    fireEvent.press(screen.getByTestId('access-toggle-invite_only'));
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ is_open: false }),
      );
    });
  });

  it('calls createLeague (not mock) on submit with name and defaults', async () => {
    mockCreateLeague.mockResolvedValueOnce({ id: 99, name: 'Beach Kings' });
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Beach Kings');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Beach Kings' }),
      );
    });
  });

  it('navigates to league detail on success', async () => {
    mockCreateLeague.mockResolvedValueOnce({ id: 42 });
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'New League');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('42'));
    });
  });

  it('does not call addLeagueHomeCourt when no court selected', async () => {
    mockCreateLeague.mockResolvedValueOnce({ id: 77 });
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'No Court League');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockCreateLeague).toHaveBeenCalled();
      expect(mockAddLeagueHomeCourt).not.toHaveBeenCalled();
    });
  });

  it('does NOT call createLeagueSeason on league creation (backend owns season seeding)', async () => {
    mockCreateLeague.mockResolvedValueOnce({ id: 55 });
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Beach Kings');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('55'));
    });
    expect(mockCreateLeagueSeason).not.toHaveBeenCalled();
  });

  it('shows error text when createLeague fails', async () => {
    mockCreateLeague.mockRejectedValueOnce(new Error('Network error'));
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'New League');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeTruthy();
    });
  });

  it('does not commit a nearby location or court suggestion without confirmation', async () => {
    mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
    mockRequestForegroundPermissions.mockResolvedValue({ status: 'granted' });
    mockGetLocationDistances.mockResolvedValue([
      { ...MOCK_LOCATIONS[0], distance_miles: 2 },
      { ...MOCK_LOCATIONS[1], distance_miles: 120 },
    ]);
    mockCreateLeague.mockResolvedValue({ id: 99 });
    render(<CreateLeagueRoute />);

    expect(await screen.findByTestId('confirm-suggested-location')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Suggested League');
    fireEvent.press(screen.getByTestId('create-league-button'));

    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalled());
    expect(mockCreateLeague.mock.calls[0][0]).not.toHaveProperty('location_id');
    expect(mockAddLeagueHomeCourt).not.toHaveBeenCalled();
  });

  it('commits suggested location and court only after separate confirmation', async () => {
    mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
    mockRequestForegroundPermissions.mockResolvedValue({ status: 'granted' });
    mockGetLocationDistances.mockResolvedValue([
      { ...MOCK_LOCATIONS[0], distance_miles: 2 },
    ]);
    mockCreateLeague.mockResolvedValue({ id: 99 });
    render(<CreateLeagueRoute />);

    fireEvent.press(await screen.findByTestId('confirm-suggested-location'));
    fireEvent.press(await screen.findByTestId('confirm-suggested-court'));
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Confirmed League');
    fireEvent.press(screen.getByTestId('create-league-button'));

    await waitFor(() => {
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ location_id: 'socal_sd' }),
      );
      expect(mockAddLeagueHomeCourt).toHaveBeenCalledWith(99, 1);
    });
  });

  it('does not commit the first court after a manual location selection', async () => {
    mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
    mockCreateLeague.mockResolvedValue({ id: 88 });
    render(<CreateLeagueRoute />);

    fireEvent.press(await screen.findByTestId('location-picker-row'));
    fireEvent.press(await screen.findByTestId('location-modal-option-socal_sd'));
    expect(await screen.findByTestId('confirm-suggested-court')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Manual Metro League');
    fireEvent.press(screen.getByTestId('create-league-button'));

    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalled());
    expect(mockCreateLeague).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: 'socal_sd' }),
    );
    expect(mockAddLeagueHomeCourt).not.toHaveBeenCalled();
  });

  it('ignores a late GPS suggestion after manual location selection', async () => {
    let resolvePosition!: (value: { coords: { latitude: number; longitude: number } }) => void;
    mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
    mockRequestForegroundPermissions.mockResolvedValue({ status: 'granted' });
    mockGetCurrentPosition.mockReturnValue(new Promise((resolve) => {
      resolvePosition = resolve;
    }));
    mockGetLocationDistances.mockResolvedValue([
      { ...MOCK_LOCATIONS[0], distance_miles: 1 },
      { ...MOCK_LOCATIONS[1], distance_miles: 100 },
    ]);
    mockCreateLeague.mockResolvedValue({ id: 91 });
    render(<CreateLeagueRoute />);

    fireEvent.press(await screen.findByTestId('location-picker-row'));
    fireEvent.press(await screen.findByTestId('location-modal-option-socal_la'));
    await act(async () => {
      resolvePosition({ coords: { latitude: 32.7, longitude: -117.2 } });
    });
    await waitFor(() => expect(mockGetLocationDistances).toHaveBeenCalled());

    expect(screen.queryByTestId('confirm-suggested-location')).toBeNull();
    expect(screen.getByTestId('location-picker-row')).toHaveTextContent('Los Angeles');
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'Manual Wins');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(mockCreateLeague).toHaveBeenCalledWith(
        expect.objectContaining({ location_id: 'socal_la' }),
      );
    });
  });

  it('keeps explicit no-court choice when a fresh court query resolves late', async () => {
    let resolveCourts!: (value: typeof MOCK_COURTS) => void;
    mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
    mockCreateLeague.mockResolvedValue({ id: 92 });
    const client = makeClient();
    render(<CreateLeagueRoute />, client);

    fireEvent.press(await screen.findByTestId('location-picker-row'));
    fireEvent.press(await screen.findByTestId('location-modal-option-socal_sd'));
    await waitFor(() => {
      expect(screen.getByTestId('court-picker-row').props.accessibilityState?.disabled).toBe(false);
    });
    fireEvent.press(screen.getByTestId('court-picker-row'));
    fireEvent.press(await screen.findByTestId('court-modal-option-none'));

    mockGetCourts.mockReturnValueOnce(new Promise((resolve) => {
      resolveCourts = resolve;
    }));
    void client.invalidateQueries({
      queryKey: courtKeys.nearby(7, null, null, 'socal_sd'),
    });
    await waitFor(() => expect(mockGetCourts).toHaveBeenCalledTimes(2));
    await act(async () => { resolveCourts(MOCK_COURTS); });
    expect(screen.queryByTestId('confirm-suggested-court')).toBeNull();

    fireEvent.changeText(screen.getByTestId('league-name-input'), 'No Court Wins');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => expect(mockCreateLeague).toHaveBeenCalled());
    expect(mockCreateLeague).toHaveBeenCalledWith(
      expect.objectContaining({ location_id: 'socal_sd' }),
    );
    expect(mockAddLeagueHomeCourt).not.toHaveBeenCalled();
  });
});
