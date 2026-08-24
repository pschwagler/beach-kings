/**
 * Tests for the Profile tab screen.
 * Covers: skeleton, data display, settings navigation, logout, error/retry,
 * and pull-to-refresh.
 */

import React from 'react';
import { render as testingRender, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
  useFocusEffect: jest.fn(),
}));

jest.mock('@/theme/usePaletteColors', () => ({
  usePaletteColors: () => ({
    brandTeal: '#2a7d9c',
    onBrandTeal: '#fff',
    textInverse: '#fff',
    textDefault: '#111',
    textTertiary: '#777',
  }),
}));
jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false }),
}));

const mockLogout = jest.fn();
const mockShowToast = jest.fn();
let mockUserId = 1;
jest.mock('@/contexts/ToastContext', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    logout: mockLogout,
    user: { id: mockUserId },
    isAuthenticated: true,
    profileComplete: true,
  }),
}));

const mockGetCurrentUserPlayer = jest.fn();
const mockGetFriendsPage = jest.fn();
const mockUpdatePlayerProfile = jest.fn();
const mockGetPlayerHomeCourts = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getFriendsPage: (...args: unknown[]) => mockGetFriendsPage(...args),
    updatePlayerProfile: (...args: unknown[]) => mockUpdatePlayerProfile(...args),
    getPlayerHomeCourts: (...args: unknown[]) => mockGetPlayerHomeCourts(...args),
    uploadAvatar: jest.fn(),
    deleteAvatar: jest.fn(),
    getLocations: jest.fn(),
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

/**
 * Real `/api/users/me/player` shape: aggregates are nested under `stats`
 * (current_rating, total_games, total_wins) with NO top-level wins/losses/
 * rating and no `losses` field at all. Losses are derived as
 * total_games - total_wins. This is the shape the endpoint actually returns.
 */
const MOCK_PLAYER_STATS_NESTED = {
  id: 1,
  name: 'Patrick Schwagler',
  first_name: 'Patrick',
  last_name: 'Schwagler',
  level: 'Open',
  city: 'New York',
  state: 'NY',
  gender: 'male',
  nickname: 'Schwags',
  stats: {
    current_rating: 1447,
    total_games: 94,
    total_wins: 66,
  },
};

/**
 * Real GET /api/friends shape: `{ items, total_count }` (see FriendListResponse).
 * `total_count` is a separate COUNT so it is accurate even when the request
 * passes `limit: 1`. The screen must read this, not a fictional `.total`.
 */
const MOCK_FRIENDS_RESPONSE = { items: [], total_count: 12 };

const MOCK_FRIENDS_RESPONSE_REAL = {
  items: [{ id: 1, player_id: 30, full_name: 'Colan Gulla' }],
  total_count: 12,
};

// ---------------------------------------------------------------------------
// Import component (after mocks)
// ---------------------------------------------------------------------------

import ProfileScreen from '../../../app/(tabs)/profile';
import { playerKeys } from '@/features/player';

let queryClient: QueryClient;

function render(ui: React.ReactElement) {
  return testingRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 1;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mockGetCurrentUserPlayer.mockResolvedValue(MOCK_PLAYER);
    mockGetFriendsPage.mockResolvedValue(MOCK_FRIENDS_RESPONSE);
    mockGetPlayerHomeCourts.mockResolvedValue([]);
    mockUpdatePlayerProfile.mockImplementation(async (updates) => updates);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('shows skeleton while data is loading', () => {
    // Return a promise that never resolves to keep loading state
    mockGetCurrentUserPlayer.mockReturnValue(new Promise(() => {}));
    mockGetFriendsPage.mockReturnValue(new Promise(() => {}));

    const { getByLabelText } = render(<ProfileScreen />);
    expect(getByLabelText('Loading profile')).toBeTruthy();
  });

  it('replaces an uncached hung request with retry after 10 seconds', () => {
    jest.useFakeTimers();
    mockGetCurrentUserPlayer.mockReturnValue(new Promise(() => {}));

    const view = render(<ProfileScreen />);
    expect(view.getByLabelText('Loading profile')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(10_000);
    });

    expect(view.getByLabelText('Failed to load profile')).toBeTruthy();
    expect(view.getByLabelText('Retry loading profile')).toBeTruthy();
    jest.useRealTimers();
  });

  it('cancels a hung initial request before retrying', async () => {
    jest.useFakeTimers();
    mockGetCurrentUserPlayer
      .mockReturnValueOnce(new Promise(() => {}))
      .mockResolvedValueOnce(MOCK_PLAYER);

    const view = render(<ProfileScreen />);
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    const retry = view.getByLabelText('Retry loading profile');
    jest.useRealTimers();

    fireEvent.press(retry);

    expect((await view.findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);
    expect(mockGetCurrentUserPlayer).toHaveBeenCalledTimes(2);
  });

  it('keeps cached profile content visible during a hung refresh', async () => {
    queryClient.setQueryData(playerKeys.me(1), MOCK_PLAYER, { updatedAt: 0 });
    mockGetCurrentUserPlayer.mockReturnValue(new Promise(() => {}));

    const view = render(<ProfileScreen />);

    expect((await view.findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);
    expect(view.queryByLabelText('Loading profile')).toBeNull();
  });

  it('does not reuse cached profile data after an account switch', async () => {
    const view = render(<ProfileScreen />);
    expect((await view.findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);

    mockUserId = 2;
    mockGetCurrentUserPlayer.mockReturnValue(new Promise(() => {}));
    view.rerender(
      <QueryClientProvider client={queryClient}>
        <ProfileScreen />
      </QueryClientProvider>,
    );

    expect(view.getByLabelText('Loading profile')).toBeTruthy();
    expect(view.queryByText('Patrick Schwagler')).toBeNull();
  });

  // ── Data display ───────────────────────────────────────────────────────────

  it('shows player name after data loads', async () => {
    const { findAllByText } = render(<ProfileScreen />);
    expect((await findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);
  });

  it('shows stats bar with games, rating, wins/losses, win rate', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('94')).toBeTruthy();   // Games
    expect(await findByText('1438')).toBeTruthy(); // Rating
    expect(await findByText('66-28')).toBeTruthy(); // W-L
    expect(await findByText('70%')).toBeTruthy();   // Win Rate
  });

  it('shows stats from the nested `stats` payload the real endpoint returns', async () => {
    // Regression: /api/users/me/player nests aggregates under `stats` and has
    // no top-level wins/losses/rating. Previously the screen read only the
    // top-level fields and rendered all zeros for the logged-in player.
    mockGetCurrentUserPlayer.mockResolvedValueOnce(MOCK_PLAYER_STATS_NESTED);

    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('94')).toBeTruthy();    // Games (stats.total_games)
    expect(await findByText('1447')).toBeTruthy();  // Rating (stats.current_rating)
    expect(await findByText('66-28')).toBeTruthy(); // W-L (wins=total_wins, losses derived)
    expect(await findByText('70%')).toBeTruthy();   // Win Rate
  });

  it('shows friends count', async () => {
    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('12 Friends')).toBeTruthy();
    expect(mockGetFriendsPage).toHaveBeenCalledWith({ page: 1, page_size: 1 });
  });

  it('shows friends count from the real `total_count` field the endpoint returns', async () => {
    // Regression: GET /api/friends returns { items, total_count }, not
    // { friends, total }. The screen previously read `.total` and always
    // rendered "0 Friends" regardless of the real count.
    mockGetFriendsPage.mockResolvedValueOnce(MOCK_FRIENDS_RESPONSE_REAL);

    const { findByText } = render(<ProfileScreen />);
    expect(await findByText('12 Friends')).toBeTruthy();
  });

  it('keeps player content visible when friend count fails', async () => {
    mockGetFriendsPage.mockRejectedValueOnce(new Error('friend count unavailable'));

    const view = render(<ProfileScreen />);

    expect((await view.findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);
    expect(await view.findByLabelText('Retry loading friend count')).toBeTruthy();
    expect(view.queryByText(/Some profile details could not be refreshed/)).toBeNull();
  });

  it('retries a failed friend count without refetching the player', async () => {
    mockGetFriendsPage.mockRejectedValueOnce(new Error('friend count unavailable'));
    const view = render(<ProfileScreen />);
    const retry = await view.findByLabelText('Retry loading friend count');
    mockGetCurrentUserPlayer.mockClear();

    fireEvent.press(retry);

    expect(await view.findByText('12 Friends')).toBeTruthy();
    expect(mockGetCurrentUserPlayer).not.toHaveBeenCalled();
    expect(mockGetFriendsPage).toHaveBeenCalledTimes(2);
  });

  it('shows profile fields like level', async () => {
    const { findAllByText } = render(<ProfileScreen />);
    // "Open" appears in both the header level badge and the info section field
    const elements = await findAllByText('Open');
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows ordered home-court names without private location details', async () => {
    mockGetPlayerHomeCourts.mockResolvedValueOnce([
      { id: 20, name: 'Second Beach', address: 'Private address 2', latitude: 2, longitude: 3, position: 1 },
      { id: 10, name: 'First Beach', address: 'Private address 1', latitude: 4, longitude: 5, position: 0 },
    ]);

    const view = render(<ProfileScreen />);
    expect(await view.findByText('1. First Beach')).toBeTruthy();
    expect(await view.findByText('2. Second Beach')).toBeTruthy();
    expect(view.queryByText(/Private address/)).toBeNull();
  });

  it('keeps profile content visible when home courts fail', async () => {
    mockGetPlayerHomeCourts.mockRejectedValueOnce(new Error('unavailable'));
    const view = render(<ProfileScreen />);

    expect((await view.findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);
    expect(await view.findByText('Home courts could not be loaded.')).toBeTruthy();
  });

  it('opens the dedicated home-court editor', async () => {
    const view = render(<ProfileScreen />);
    fireEvent.press(await view.findByLabelText('Edit home courts'));
    expect(mockPush).toHaveBeenCalledWith('/(stack)/profile/home-courts');
  });

  it('presents profile details as compact tappable rows instead of permanent inputs', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    const infoList = await findByTestId('profile-info-list');
    const nicknameRow = await findByTestId('profile-info-nickname');

    expect(infoList.props.className).toContain('bg-surface');
    expect(nicknameRow.props.className).toContain('border-b');
    expect(nicknameRow.props.className).not.toContain('rounded');
    expect(nicknameRow.props.accessibilityRole).toBe('button');
  });

  it('uses neutral copy for optional details that have not been provided', async () => {
    mockGetCurrentUserPlayer.mockResolvedValueOnce({
      ...MOCK_PLAYER,
      nickname: null,
    });

    const { findByTestId, queryByText } = render(<ProfileScreen />);
    expect(await findByTestId('profile-info-nickname')).toHaveTextContent(
      'Add nickname',
    );
    expect(queryByText('Not provided')).toBeNull();
  });

  it('normalizes preferred-side display formatting', async () => {
    mockGetCurrentUserPlayer.mockResolvedValueOnce({
      ...MOCK_PLAYER,
      preferred_side: 'left',
    });

    const { findByTestId } = render(<ProfileScreen />);
    expect(await findByTestId('profile-info-preferred-side')).toHaveTextContent(
      'Left',
    );
  });

  it('dedupes a state name already baked into the city column', async () => {
    // Real player #1 row: city already holds "Greenpoint, New York, New York".
    mockGetCurrentUserPlayer.mockResolvedValueOnce({
      ...MOCK_PLAYER,
      city: 'Greenpoint, New York, New York',
      state: 'New York',
    });
    const { findAllByText, queryByText } = render(<ProfileScreen />);
    expect((await findAllByText('Greenpoint, New York')).length).toBeGreaterThan(0);
    expect(queryByText('Greenpoint, New York, New York, New York')).toBeNull();
    expect(queryByText('Greenpoint, New York, New York')).toBeNull();
  });

  // ── Settings navigation ────────────────────────────────────────────────────

  it('does not show a Settings or Edit action in the top nav', async () => {
    const { findAllByText, getAllByLabelText, queryByLabelText } = render(<ProfileScreen />);
    await findAllByText('Patrick Schwagler');
    expect(getAllByLabelText('Settings')).toHaveLength(1);
    expect(queryByLabelText('Edit Profile')).toBeNull();
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

  it('pressing a profile value opens its focused editor without navigation', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-info-nickname'));
    expect(await findByTestId('profile-editor-nickname')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalledWith('/(stack)/edit-profile');
  });

  it('saves only the field owned by the focused editor', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-info-nickname'));
    fireEvent.changeText(await findByTestId('profile-editor-nickname'), '  Ace  ');
    fireEvent.press(await findByTestId('profile-editor-nickname-save'));

    await waitFor(() => {
      expect(mockUpdatePlayerProfile).toHaveBeenCalledWith({ nickname: 'Ace' });
    });
    expect(mockShowToast).toHaveBeenCalledWith('Profile updated.', 'success');
  });

  it('asks before dismissing a dirty editor', async () => {
    const { findByTestId, findByLabelText } = render(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-info-height'));
    fireEvent.changeText(await findByTestId('profile-editor-height'), '6 ft');
    fireEvent.press(await findByLabelText('Cancel'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard changes?',
      expect.stringContaining('unsaved'),
      expect.any(Array),
    );
  });

  it('keeps height units and examples visible while the value is edited', async () => {
    const { findByTestId, findByText } = render(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-info-height'));

    const guidance = await findByText(/feet and inches.*meters/i);
    fireEvent.changeText(await findByTestId('profile-editor-height'), '1.78 m');

    expect(guidance).toBeTruthy();
    expect(await findByText(/feet and inches.*meters/i)).toBeTruthy();
  });

  it('lets the sheet own keyboard avoidance while keeping profile actions tappable', async () => {
    const { findByTestId } = render(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-info-height'));

    expect(await findByTestId('bottom-sheet-keyboard-avoider')).toHaveProp(
      'enabled',
      true,
    );
    expect(await findByTestId('profile-editor-scroll')).toHaveProp(
      'keyboardShouldPersistTaps',
      'always',
    );
  });

  it('pressing Friends opens the Friends subsection deterministically', async () => {
    const { findAllByLabelText } = render(<ProfileScreen />);
    const friendsButtons = await findAllByLabelText('Friends');
    fireEvent.press(friendsButtons[0]);
    fireEvent.press(friendsButtons[friendsButtons.length - 1]);
    expect(mockPush).toHaveBeenNthCalledWith(
      1,
      '/(tabs)/social?tab=friends',
    );
    expect(mockPush).toHaveBeenNthCalledWith(
      2,
      '/(tabs)/social?tab=friends',
    );
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
    mockGetFriendsPage.mockRejectedValueOnce(new Error('network error'));

    const { findByLabelText } = render(<ProfileScreen />);
    expect(await findByLabelText('Failed to load profile')).toBeTruthy();
  });

  it('pressing Retry re-fetches data', async () => {
    mockGetCurrentUserPlayer
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(MOCK_PLAYER);
    mockGetFriendsPage
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce(MOCK_FRIENDS_RESPONSE);

    const { findByLabelText, findAllByText } = render(<ProfileScreen />);
    const retryBtn = await findByLabelText('Retry loading profile');
    fireEvent.press(retryBtn);

    expect((await findAllByText('Patrick Schwagler')).length).toBeGreaterThan(0);
  });

  // ── Pull-to-refresh ────────────────────────────────────────────────────────

  it('pull-to-refresh triggers a refetch', async () => {
    const { findAllByText, getByTestId } = render(<ProfileScreen />);
    await findAllByText('Patrick Schwagler');

    // Clear previous calls
    mockGetCurrentUserPlayer.mockClear();
    mockGetCurrentUserPlayer.mockResolvedValueOnce({ ...MOCK_PLAYER, nickname: 'Refreshed' });
    mockGetFriendsPage.mockResolvedValueOnce(MOCK_FRIENDS_RESPONSE);

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
