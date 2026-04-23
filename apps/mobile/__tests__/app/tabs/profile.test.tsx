/**
 * Tests for the Profile tab screen.
 * Covers: skeleton, data display, settings navigation, logout, error/retry,
 * and pull-to-refresh.
 */

import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(),
  hapticMedium: jest.fn(),
  hapticHeavy: jest.fn(),
  hapticSuccess: jest.fn(),
  hapticError: jest.fn(),
}));

const mockPush = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
}));

const mockLogout = jest.fn();
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: mockLogout,
    user: { id: 1 },
    isAuthenticated: true,
    profileComplete: true,
  }),
}));

const mockGetCurrentUserPlayer = jest.fn();
const mockGetFriends = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getFriends: (...args: unknown[]) => mockGetFriends(...args),
  },
}));

jest.spyOn(Alert, 'alert');

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_PLAYER = {
  id: 1,
  name: 'Patrick Schwagler',
  first_name: 'Patrick',
  last_name: 'Schwagler',
  current_rating: 1438,
  wins: 66,
  losses: 28,
  total_games: 94,
  level: 'Open',
  city: 'New York',
  state: 'NY',
  gender: 'male',
  nickname: 'Schwags',
};

const MOCK_FRIENDS_RESPONSE = { friends: [], total: 12 };

// ---------------------------------------------------------------------------
// Import component (after mocks)
// ---------------------------------------------------------------------------

import ProfileScreen from '../../../app/(tabs)/profile';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetCurrentUserPlayer.mockResolvedValue(MOCK_PLAYER);
    mockGetFriends.mockResolvedValue(MOCK_FRIENDS_RESPONSE);
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows skeleton while data is loading', () => {
    // Return a promise that never resolves to keep loading state
    mockGetCurrentUserPlayer.mockReturnValue(new Promise(() => {}));
    mockGetFriends.mockReturnValue(new Promise(() => {}));

    const { getByLabelText } = render(<ProfileScreen />);
    expect(getByLabelText('Loading profile')).toBeTruthy();
  });

  // ── Data display ───────────────────────────────────────────────────────────

  it('shows player name after data loads', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('Patrick Schwagler')).toBeTruthy();
  });

  it('shows stats bar with games, rating, wins/losses, win rate', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('94')).toBeTruthy();   // Games
    expect(await findByText('1438')).toBeTruthy(); // Rating
    expect(await findByText('66-28')).toBeTruthy(); // W-L
    expect(await findByText('70%')).toBeTruthy();   // Win Rate
  });

  it('shows friends count', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('12 Friends')).toBeTruthy();
  });

  it('shows profile fields like level', async () => {
    const { findAllByText } = render(<ProfileScreen />);
    // "Open" appears in both the header level badge and the info section field
    const elements = await findAllByText('Open');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  // ── Settings navigation ────────────────────────────────────────────────────

  it('pressing Settings in top nav navigates to settings', async () => {
    const { findByLabelText } = render(<ProfileScreen />);
    const settingsBtn = await findByLabelText('Settings');
    fireEvent.press(settingsBtn);
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings');
  });

  it('pressing Settings in menu section navigates to settings', async () => {
    const { findAllByLabelText } = render(<ProfileScreen />);
    const buttons = await findAllByLabelText('Settings');
    // At least one should be in the menu; press the last one (menu row)
    fireEvent.press(buttons[buttons.length - 1]);
    expect(mockPush).toHaveBeenCalledWith('/(stack)/settings');
  });

  it('pressing My Stats navigates to my-stats', async () => {
    const { findByLabelText } = render(<ProfileScreen />);
    const btn = await findByLabelText('My Stats');
    fireEvent.press(btn);
    expect(mockPush).toHaveBeenCalledWith('/(stack)/my-stats');
  });

  it('pressing My Games navigates to my-games', async () => {
    const { findByLabelText } = render(<ProfileScreen />);
    const btn = await findByLabelText('My Games');
    fireEvent.press(btn);
    expect(mockPush).toHaveBeenCalledWith('/(stack)/my-games');
  });

  // ── Logout ─────────────────────────────────────────────────────────────────

  it('pressing Log Out shows a confirmation alert', async () => {
    const { findByLabelText } = render(<ProfileScreen />);
    const logoutBtn = await findByLabelText('Log Out');
    fireEvent.press(logoutBtn);
    expect(Alert.alert).toHaveBeenCalledWith(
      'Log Out',
      expect.stringContaining('sure'),
      expect.any(Array),
      expect.anything(),
    );
  });

  it('confirming logout calls auth.logout() and hapticMedium', async () => {
    const { hapticMedium } = require('@/utils/haptics');
    mockLogout.mockResolvedValueOnce(undefined);

    // Capture the buttons passed to Alert.alert
    let alertButtons: { text: string; onPress?: () => void }[] = [];
    (Alert.alert as jest.Mock).mockImplementationOnce(
      (_title, _msg, buttons) => { alertButtons = buttons; },
    );

    const { findByLabelText } = render(<ProfileScreen />);
    const logoutBtn = await findByLabelText('Log Out');
    fireEvent.press(logoutBtn);

    const confirmBtn = alertButtons.find((b) => b.text === 'Log Out');
    expect(confirmBtn).toBeDefined();

    await act(async () => {
      confirmBtn?.onPress?.();
    });

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(hapticMedium).toHaveBeenCalledTimes(1);
    });
  });

  it('cancelling logout does NOT call auth.logout()', async () => {
    let alertButtons: { text: string; onPress?: () => void }[] = [];
    (Alert.alert as jest.Mock).mockImplementationOnce(
      (_title, _msg, buttons) => { alertButtons = buttons; },
    );

    const { findByLabelText } = render(<ProfileScreen />);
    const logoutBtn = await findByLabelText('Log Out');
    fireEvent.press(logoutBtn);

    const cancelBtn = alertButtons.find((b) => b.text === 'Cancel');
    cancelBtn?.onPress?.();

    expect(mockLogout).not.toHaveBeenCalled();
  });

  // ── Error state ────────────────────────────────────────────────────────────

  it('shows error state when API fails', async () => {
    mockGetCurrentUserPlayer.mockRejectedValueOnce(new Error('network error'));
    mockGetFriends.mockRejectedValueOnce(new Error('network error'));

    const { findByLabelText } = render(<ProfileScreen />);
    expect(await findByLabelText('Failed to load profile')).toBeTruthy();
  });

  it('pressing Retry re-fetches data', async () => {
    mockGetCurrentUserPlayer
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(MOCK_PLAYER);
    mockGetFriends
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(MOCK_FRIENDS_RESPONSE);

    const { findByLabelText, findByText } = render(<ProfileScreen />);
    const retryBtn = await findByLabelText('Retry loading profile');
    fireEvent.press(retryBtn);

    expect(await findByText('Patrick Schwagler')).toBeTruthy();
  });

  // ── Pull-to-refresh ────────────────────────────────────────────────────────

  it('pull-to-refresh triggers a refetch', async () => {
    const { findByText, getByTestId } = render(<ProfileScreen />);
    await findByText('Patrick Schwagler');

    // Clear previous calls
    mockGetCurrentUserPlayer.mockClear();
    mockGetCurrentUserPlayer.mockResolvedValueOnce({ ...MOCK_PLAYER, nickname: 'Refreshed' });
    mockGetFriends.mockResolvedValueOnce(MOCK_FRIENDS_RESPONSE);

    const scrollView = getByTestId('profile-scroll-view');
    const refreshControl = (
      scrollView as {
        props?: {
          refreshControl?: { props?: { onRefresh?: () => void } };
        };
      }
    ).props?.refreshControl;

    if (refreshControl?.props?.onRefresh) {
      await act(async () => {
        refreshControl.props!.onRefresh!();
      });
    }

    await waitFor(() => {
      expect(mockGetCurrentUserPlayer).toHaveBeenCalledTimes(1);
    });
  });
});
