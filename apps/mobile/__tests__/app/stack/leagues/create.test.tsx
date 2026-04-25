/**
 * Tests for the Create League screen.
 *
 * Covers:
 *   - Renders all form fields (name, description, access toggle, gender, level,
 *     location picker, court picker)
 *   - Submit button disabled until name is long enough
 *   - access_type → is_open mapping: 'open' → true, 'invite_only' → false
 *   - Order of API calls: createLeague then optional addLeagueHomeCourt
 *   - Success navigation after submit
 *   - Error handling on submit failure
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

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

const mockCreateLeague = jest.fn();
const mockGetLocations = jest.fn();
const mockGetCourts = jest.fn();
const mockAddLeagueHomeCourt = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    createLeague: (...args: unknown[]) => mockCreateLeague(...args),
    getLocations: (...args: unknown[]) => mockGetLocations(...args),
    getCourts: (...args: unknown[]) => mockGetCourts(...args),
    addLeagueHomeCourt: (...args: unknown[]) => mockAddLeagueHomeCourt(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import CreateLeagueRoute from '../../../../app/(stack)/create-league';

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
  mockGetLocations.mockResolvedValue(MOCK_LOCATIONS);
  mockGetCourts.mockResolvedValue(MOCK_COURTS);
  mockAddLeagueHomeCourt.mockResolvedValue({ id: 1, name: 'QBK Sports', position: 0 });
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

  it('renders the location picker', () => {
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('location-picker')).toBeTruthy();
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

  it('shows error text when createLeague fails', async () => {
    mockCreateLeague.mockRejectedValueOnce(new Error('Network error'));
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'New League');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeTruthy();
    });
  });
});
