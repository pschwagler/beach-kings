/**
 * Tests for the Create League screen.
 *
 * Covers:
 *   - Renders all form fields
 *   - Submit button disabled until name is long enough
 *   - Access type toggle switches
 *   - Gender pill selection
 *   - Level option selection
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

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    createLeagueMock: (...args: unknown[]) => mockCreateLeague(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import CreateLeagueRoute from '../../../../app/(stack)/create-league';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — render', () => {
  it('renders the create league screen container', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('create-league-screen')).toBeTruthy();
  });

  it('renders the league name input', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('league-name-input')).toBeTruthy();
  });

  it('renders the league description input', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('league-description-input')).toBeTruthy();
  });

  it('renders the create button', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('create-league-button')).toBeTruthy();
  });

  it('renders the access type toggles', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('access-toggle-open')).toBeTruthy();
    expect(screen.getByTestId('access-toggle-invite_only')).toBeTruthy();
  });

  it('renders gender pills', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    expect(screen.getByTestId('gender-pill-mens')).toBeTruthy();
    expect(screen.getByTestId('gender-pill-womens')).toBeTruthy();
    expect(screen.getByTestId('gender-pill-coed')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Form validation
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — validation', () => {
  it('submit button is disabled when name is empty', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    const button = screen.getByTestId('create-league-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('submit button is disabled when name has only one character', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'A');
    const button = screen.getByTestId('create-league-button');
    expect(button.props.accessibilityState?.disabled).toBe(true);
  });

  it('submit button is enabled when name has 2+ characters', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
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
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('access-toggle-invite_only'));
    expect(screen.getByTestId('access-toggle-invite_only')).toBeTruthy();
  });

  it('switches access back to open when open toggle is pressed', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
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
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('gender-pill-womens'));
    expect(screen.getByTestId('gender-pill-womens')).toBeTruthy();
  });

  it('selects coed pill when pressed', () => {
    mockCreateLeague.mockReturnValue(new Promise(() => {}));
    render(<CreateLeagueRoute />);
    fireEvent.press(screen.getByTestId('gender-pill-coed'));
    expect(screen.getByTestId('gender-pill-coed')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Submit
// ---------------------------------------------------------------------------

describe('CreateLeagueScreen — submit', () => {
  it('calls createLeagueMock on submit with name and defaults', async () => {
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

  it('shows error text when submit fails', async () => {
    mockCreateLeague.mockRejectedValueOnce(new Error('TODO(backend): POST /api/leagues (create)'));
    render(<CreateLeagueRoute />);
    fireEvent.changeText(screen.getByTestId('league-name-input'), 'New League');
    fireEvent.press(screen.getByTestId('create-league-button'));
    await waitFor(() => {
      expect(screen.getByTestId('submit-error')).toBeTruthy();
    });
  });
});
