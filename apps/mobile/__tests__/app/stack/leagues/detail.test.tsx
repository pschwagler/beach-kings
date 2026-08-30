/**
 * Tests for the League Detail screen.
 *
 * Covers:
 *   - Header renders league name, location, member count
 *   - Active season and rank badges render
 *   - 5 segment tabs render and switch
 *   - Admin sees Start Session button; members don't
 *   - Invite button present for admin and member
 *   - Loading and error states
 *   - Tab switching renders correct tab component
 */

import React from 'react';
import { Alert, Keyboard } from 'react-native';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockSearchParams: { id: string; tab?: string } = { id: '1' };

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('expo-router', () => {
  const ReactModule = require('react');
  return {
    useSegments: () => [],
    useRouter: () => ({ canGoBack: () => true, push: mockPush, back: mockBack, replace: mockReplace }),
    useLocalSearchParams: () => mockSearchParams,
    // The standings tab refetches on focus (useRefreshOnFocus → useFocusEffect).
    useFocusEffect: (cb: () => void | (() => void)): void => {
      ReactModule.useEffect(() => cb(), [cb]);
    },
  };
});

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

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, theme: 'light', setTheme: jest.fn() }),
}));

jest.mock('@/features/notifications', () => ({
  useNotifications: () => ({ unreadCount: 0, refresh: jest.fn() }),
}));

const mockGetLeagueStandings = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockGetLeagueMessages = jest.fn();
const mockCreateLeagueMessage = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockLeaveLeague = jest.fn();
const mockGetLeagueSignups = jest.fn();
const mockJoinSignup = jest.fn();
const mockDropSignup = jest.fn();
const mockGetLeaguePlayerStats = jest.fn();
const mockGetMyGames = jest.fn();
const mockGetLeague = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetLeagueJoinRequests = jest.fn();
const mockApproveJoinRequest = jest.fn();
const mockRejectJoinRequest = jest.fn();
const mockRequestToJoinLeague = jest.fn();
const mockJoinLeague = jest.fn();
const mockGetReceivedLeagueInvites = jest.fn();
const mockAcceptLeagueInvite = jest.fn();
const mockDeclineLeagueInvite = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeagueStandings: (...args: unknown[]) => mockGetLeagueStandings(...args),
    getLeagueMessages: (...args: unknown[]) => mockGetLeagueMessages(...args),
    createLeagueMessage: (...args: unknown[]) => mockCreateLeagueMessage(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    leaveLeague: (...args: unknown[]) => mockLeaveLeague(...args),
    getMyGames: (...args: unknown[]) => mockGetMyGames(...args),
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
    getLeagueJoinRequests: (...args: unknown[]) => mockGetLeagueJoinRequests(...args),
    approveJoinRequest: (...args: unknown[]) => mockApproveJoinRequest(...args),
    rejectJoinRequest: (...args: unknown[]) => mockRejectJoinRequest(...args),
    getLeagueSignups: (...args: unknown[]) => mockGetLeagueSignups(...args),
    joinSignup: (...args: unknown[]) => mockJoinSignup(...args),
    dropSignup: (...args: unknown[]) => mockDropSignup(...args),
    getLeaguePlayerStats: (...args: unknown[]) => mockGetLeaguePlayerStats(...args),
    requestToJoinLeague: (...args: unknown[]) => mockRequestToJoinLeague(...args),
    joinLeague: (...args: unknown[]) => mockJoinLeague(...args),
    getReceivedLeagueInvites: (...args: unknown[]) =>
      mockGetReceivedLeagueInvites(...args),
    acceptLeagueInvite: (...args: unknown[]) =>
      mockAcceptLeagueInvite(...args),
    declineLeagueInvite: (...args: unknown[]) =>
      mockDeclineLeagueInvite(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import LeagueDetailRoute from '../../../../app/(stack)/league/[id]';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const MOCK_DETAIL = {
  id: 1,
  name: 'Manhattan Open',
  description: 'NYC top level league',
  access_type: 'open',
  is_public: true,
  gender: 'coed',
  level: 'Open',
  location_name: 'Manhattan, NY',
  home_courts: [],
  member_count: 24,
  season_count: 3,
  current_season_id: 10,
  current_season_name: 'Summer 2025',
  is_active: true,
  user_role: 'admin',
  user_rank: 2,
  user_wins: 10,
  user_losses: 3,
  user_rating: 1520,
  has_pending_request: false,
};

/** A non-member (visitor) view of an open league. */
const VISITOR_DETAIL = {
  ...MOCK_DETAIL,
  user_role: null,
  user_rank: null,
  user_wins: null,
  user_losses: null,
  user_rating: null,
  has_pending_request: false,
};

const RECEIVED_INVITE = {
  id: 91,
  league_id: 1,
  league_name: 'Manhattan Open',
  player_id: 1,
  display_name: 'Test Player',
  initials: 'MO',
  invited_at: '2026-08-24T12:00:00Z',
  status: 'pending' as const,
};

const ONE_STANDING = {
  standings: [
    {
      player_id: 77,
      rank: 1,
      display_name: 'Sandy Spiker',
      initials: 'SS',
      avatar_url: null,
      wins: 12,
      losses: 1,
      win_rate: 92.3,
      rating: 1600,
      rating_delta: null,
      games_played: 13,
    },
  ],
  season_info: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = { id: '1' };
  mockGetLeague.mockResolvedValue(MOCK_DETAIL);
  mockGetLeagueStandings.mockResolvedValue({ standings: [], season_info: null });
  mockGetLeagueSeasons.mockResolvedValue([]);
  mockGetLeagueMessages.mockResolvedValue([]);
  mockCreateLeagueMessage.mockResolvedValue({});
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 1 });
  mockLeaveLeague.mockResolvedValue(undefined);
  mockGetLeagueSignups.mockResolvedValue({ signups: [], schedule: [] });
  mockJoinSignup.mockResolvedValue(undefined);
  mockDropSignup.mockResolvedValue(undefined);
  mockGetLeaguePlayerStats.mockResolvedValue({});
  mockGetMyGames.mockResolvedValue({ games: [], total: 0 });
  mockGetLeagueMembers.mockResolvedValue([]);
  mockGetLeagueJoinRequests.mockResolvedValue({ pending: [], rejected: [] });
  mockApproveJoinRequest.mockResolvedValue({ success: true });
  mockRejectJoinRequest.mockResolvedValue({ success: true });
  mockRequestToJoinLeague.mockResolvedValue({ success: true, message: 'ok' });
  mockJoinLeague.mockResolvedValue({ success: true, message: 'Joined!' });
  mockGetReceivedLeagueInvites.mockResolvedValue([]);
  mockAcceptLeagueInvite.mockResolvedValue({ status: 'accepted' });
  mockDeclineLeagueInvite.mockResolvedValue({ status: 'declined' });
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — loading', () => {
  it('renders loading indicator while detail is fetching', () => {
    mockGetLeague.mockReturnValue(new Promise(() => {}));
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('league-detail-loading')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — header', () => {
  it('uses a generic nav title and renders the league name once in the body header', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });

    const bodyHeader = await screen.findByTestId('league-header');

    expect(screen.getByRole('header', { name: 'League' })).toBeTruthy();
    expect(within(bodyHeader).getByText(MOCK_DETAIL.name)).toBe(
      screen.getByTestId('league-header-name'),
    );
    expect(screen.getAllByText(MOCK_DETAIL.name)).toHaveLength(1);
  });

  it('renders the league header container', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-header')).toBeTruthy();
    });
  });

  it('does NOT render invite or start-session buttons in header', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-header')).toBeTruthy());
    expect(screen.queryByTestId('invite-button')).toBeNull();
    expect(screen.queryByTestId('start-session-button')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Segment tabs
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — segment tabs', () => {
  it('renders the segment bar', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-segment-bar')).toBeTruthy();
    });
  });

  it('renders the member tab buttons (signups temporarily disabled)', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-segment-bar')).toBeTruthy());
    expect(screen.getByTestId('segment-tab-games')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-standings')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-chat')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-info')).toBeTruthy();
    // 'signups' is disabled for now (needs a web-admin season/schedule; renders
    // empty on mobile). Re-enable via MEMBER_TABS in useLeagueDetailScreen.
    expect(screen.queryByTestId('segment-tab-signups')).toBeNull();
    expect(screen.getByTestId('segment-tab-games')).toHaveProp(
      'accessibilityRole',
      'tab',
    );
    expect(screen.getByTestId('segment-tab-games')).toHaveAccessibilityState({
      selected: true,
    });
  });

  it('renders games tab content by default', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    // matches-tab renders when sessions exist; matches-empty when data is []
    await waitFor(() => {
      const tabOrEmpty =
        screen.queryByTestId('matches-tab') ?? screen.queryByTestId('matches-empty');
      expect(tabOrEmpty).toBeTruthy();
    });
  });

  it('opens the tab requested by a notification deep link', async () => {
    mockSearchParams = { id: '1', tab: 'chat' };
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId('chat-tab')).toBeTruthy();
    });
    expect(screen.getByTestId('segment-tab-chat')).toHaveAccessibilityState({
      selected: true,
    });
  });

  it('switches to standings tab on press', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-standings')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-standings'));
    await waitFor(() => {
      expect(screen.getByTestId('standings-tab')).toBeTruthy();
    });
  });

  it('switches to chat tab on press', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-chat')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-chat'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-tab')).toBeTruthy();
    });
  });

  // Signups tab is temporarily disabled (see MEMBER_TABS in useLeagueDetailScreen).
  // Re-enable this test alongside the tab.
  it.skip('switches to signups tab on press', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-signups')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-signups'));
    await waitFor(() => {
      expect(screen.getByTestId('signups-tab')).toBeTruthy();
    });
  });

  it('switches to info tab on press', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-info')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-info'));
    await waitFor(() => {
      expect(screen.getByTestId('info-tab')).toBeTruthy();
    });
  });

  it('dismisses the keyboard, navigates once, and preserves the chat draft', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-chat')).toBeTruthy());

    fireEvent.press(screen.getByTestId('segment-tab-chat'));
    await waitFor(() => expect(screen.getByTestId('chat-message-input')).toBeTruthy());
    fireEvent.changeText(
      screen.getByTestId('chat-message-input'),
      'Unsaved league draft',
    );

    fireEvent.press(screen.getByTestId('segment-tab-info'));
    await waitFor(() => expect(screen.getByTestId('info-tab')).toBeTruthy());
    expect(dismissSpy).toHaveBeenCalledTimes(2);

    fireEvent.press(screen.getByTestId('segment-tab-chat'));
    await waitFor(() => {
      expect(screen.getByTestId('chat-message-input')).toHaveProp(
        'value',
        'Unsaved league draft',
      );
    });
    expect(dismissSpy).toHaveBeenCalledTimes(3);
    dismissSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — navigation', () => {
  it('pressing Add Game navigates directly to score-game with leagueId and seasonId', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-add-game-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('league-add-game-btn'));
    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('/(stack)/score-game');
    expect(url).toContain(`leagueId=${MOCK_DETAIL.id}`);
    expect(url).toContain(`seasonId=${MOCK_DETAIL.current_season_id}`);
    expect(url).toContain('headerTitle=Add%20Game');
    expect(url).not.toContain('add-games');
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — error', () => {
  it('renders a terminal unavailable state without a manual retry action', async () => {
    mockGetLeague.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-detail-error')).toBeTruthy();
    });
    expect(screen.getByText('League unavailable')).toBeTruthy();
    expect(screen.queryByText('Try Again')).toBeNull();
    expect(mockGetLeague).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Signups tab — real API integration
// ---------------------------------------------------------------------------

// Signups tab is temporarily disabled (see MEMBER_TABS in useLeagueDetailScreen);
// it is unreachable via the segment bar, so these integration-via-tab tests are
// skipped. Re-enable together with the tab. The LeagueSignupsTab component keeps
// its own unit tests.
describe.skip('LeagueDetailScreen — signups tab', () => {
  it('calls getLeagueSignups when signups tab is active', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-signups')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-signups'));
    await waitFor(() => {
      expect(mockGetLeagueSignups).toHaveBeenCalledWith(1);
    });
  });

  it('renders empty signups tab when API returns no signups', async () => {
    mockGetLeagueSignups.mockResolvedValue({ signups: [], schedule: [] });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-signups')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-signups'));
    await waitFor(() => {
      expect(screen.getByTestId('signups-tab')).toBeTruthy();
    });
  });

  it('renders an event card when getLeagueSignups returns an upcoming signup', async () => {
    mockGetLeagueSignups.mockResolvedValue({
      signups: [
        {
          id: 42,
          scheduled_datetime: '2030-06-15T18:00:00Z',
          duration_hours: 2,
          court_name: 'Beach Court 1',
          player_count: 5,
          is_open: true,
          user_status: 'none',
        },
      ],
      schedule: [],
    });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-signups')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-signups'));
    await waitFor(() => {
      expect(screen.getByTestId('event-card-42')).toBeTruthy();
    });
  });

  it('renders signed-up status and drop button for a signed-up event', async () => {
    mockGetLeagueSignups.mockResolvedValue({
      signups: [
        {
          id: 99,
          scheduled_datetime: '2030-06-20T14:00:00Z',
          duration_hours: 2,
          court_name: null,
          player_count: 3,
          is_open: true,
          user_status: 'signed_up',
        },
      ],
      schedule: [],
    });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-signups')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-signups'));
    await waitFor(() => {
      expect(screen.getByTestId('drop-event-btn-99')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Non-member (visitor) view
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — non-member visitor', () => {
  it('shows explicit invitation context with primary Accept and secondary Decline', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    mockGetReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });

    await waitFor(() =>
      expect(screen.getByTestId('league-invitation-banner')).toBeTruthy(),
    );
    expect(screen.getByText('You’re invited')).toBeTruthy();
    expect(screen.getByLabelText('Accept invitation to Manhattan Open')).toBeTruthy();
    expect(screen.getByLabelText('Decline invitation to Manhattan Open')).toBeTruthy();
    expect(screen.queryByTestId('league-join-banner')).toBeNull();
  });

  it('accepts from the invitation banner and transitions to member detail', async () => {
    mockGetLeague
      .mockResolvedValueOnce(VISITOR_DETAIL)
      .mockResolvedValue({ ...MOCK_DETAIL, user_role: 'member' });
    mockGetReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId('league-invitation-accept')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('league-invitation-accept'));

    await waitFor(() => {
      expect(mockAcceptLeagueInvite).toHaveBeenCalledWith(1);
      expect(screen.queryByTestId('league-invitation-banner')).toBeNull();
      expect(screen.getByTestId('segment-tab-games')).toBeTruthy();
    });
  });

  it('declines from the invitation banner and restores the generic visitor view', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    mockGetReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId('league-invitation-decline')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('league-invitation-decline'));

    await waitFor(() => {
      expect(mockDeclineLeagueInvite).toHaveBeenCalledWith(1);
      expect(screen.queryByTestId('league-invitation-banner')).toBeNull();
      expect(screen.getByTestId('league-join-banner')).toBeTruthy();
    });
  });

  it('restores the invitation banner after a failed response', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    mockGetReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
    mockAcceptLeagueInvite.mockRejectedValue(new Error('offline'));
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(screen.getByTestId('league-invitation-accept')).toBeTruthy(),
    );

    fireEvent.press(screen.getByTestId('league-invitation-accept'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        'Error',
        'Could not accept the invite. Please try again.',
      );
      expect(screen.getByTestId('league-invitation-banner')).toBeTruthy();
    });
    alertSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('shows only standings + info tabs (hides games, chat, sign ups)', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-segment-bar')).toBeTruthy());

    expect(screen.getByTestId('segment-tab-standings')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-info')).toBeTruthy();
    expect(screen.queryByTestId('segment-tab-games')).toBeNull();
    expect(screen.queryByTestId('segment-tab-chat')).toBeNull();
    expect(screen.queryByTestId('segment-tab-signups')).toBeNull();
  });

  it('does not show the Add Game action', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-segment-bar')).toBeTruthy());
    expect(screen.queryByTestId('league-add-game-btn')).toBeNull();
  });

  it('renders a Request to join CTA for a public league', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-banner')).toBeTruthy());
    expect(screen.getByTestId('league-request-join-btn')).toBeTruthy();
    expect(screen.queryByTestId('league-join-btn')).toBeNull();
  });

  it('calls api.requestToJoinLeague for the public-league CTA', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-request-join-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('league-request-join-btn'));
    await waitFor(() => expect(mockRequestToJoinLeague).toHaveBeenCalledWith(1));
    expect(mockJoinLeague).not.toHaveBeenCalled();
  });

  it('shows no self-request CTA for an invite-only league', async () => {
    mockGetLeague.mockResolvedValue({ ...VISITOR_DETAIL, access_type: 'invite_only' });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-banner')).toBeTruthy());
    expect(screen.getByText('Invite only · Message an admin to learn more')).toBeTruthy();
    expect(screen.queryByTestId('league-request-join-btn')).toBeNull();
    expect(screen.queryByTestId('league-join-btn')).toBeNull();
  });

  it('shows current admins and opens a direct message from league info', async () => {
    mockGetLeague.mockResolvedValue({
      ...VISITOR_DETAIL,
      access_type: 'invite_only',
      created_by_player_id: 77,
    });
    mockGetLeagueMembers.mockResolvedValue([
      {
        id: 10,
        player_id: 77,
        player_name: 'Sandy Spiker',
        player_avatar: null,
        role: 'admin',
        created_at: '2026-08-30T12:00:00Z',
      },
    ]);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('segment-tab-info')).toBeTruthy());
    fireEvent.press(screen.getByTestId('segment-tab-info'));
    await waitFor(() => expect(screen.getByTestId('message-admin-77')).toBeTruthy());
    expect(screen.getByText('Creator')).toBeTruthy();
    fireEvent.press(screen.getByTestId('message-admin-77'));
    expect(mockPush).toHaveBeenCalledWith(
      '/(stack)/messages/77?name=Sandy%20Spiker',
    );
  });

  it('shows "Request sent" when a public request is already pending', async () => {
    mockGetLeague.mockResolvedValue({
      ...VISITOR_DETAIL,
      access_type: 'open',
      has_pending_request: true,
    });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-banner')).toBeTruthy());
    expect(screen.getByTestId('league-join-pending')).toBeTruthy();
    expect(screen.queryByTestId('league-join-btn')).toBeNull();
    expect(screen.queryByTestId('league-request-join-btn')).toBeNull();
  });

  it('shows an Alert and does not crash when requestToJoinLeague fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    mockRequestToJoinLeague.mockRejectedValue(new Error('boom'));
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-request-join-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('league-request-join-btn'));
    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    alertSpy.mockRestore();
  });

  it('routes a standings player tap to the public profile (not in-league stats)', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    mockGetLeagueStandings.mockResolvedValue(ONE_STANDING);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });

    // Standings is the default tab for a visitor.
    await waitFor(() => expect(screen.getByTestId('standings-row-77')).toBeTruthy());
    fireEvent.press(screen.getByTestId('standings-row-77'));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const dest = mockPush.mock.calls[0][0] as string;
    expect(dest).toContain('/(stack)/player/77');
  });

  it('hides the standings tab for a visitor of a private league (avoids the 403)', async () => {
    mockGetLeague.mockResolvedValue({ ...VISITOR_DETAIL, is_public: false });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-segment-bar')).toBeTruthy());

    expect(screen.queryByTestId('segment-tab-standings')).toBeNull();
    expect(screen.getByTestId('segment-tab-info')).toBeTruthy();
    expect(mockGetLeagueStandings).not.toHaveBeenCalled();
  });

  it('keeps the standings tab for a visitor of a public league', async () => {
    mockGetLeague.mockResolvedValue({ ...VISITOR_DETAIL, is_public: true });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-segment-bar')).toBeTruthy());

    expect(screen.getByTestId('segment-tab-standings')).toBeTruthy();
  });
});
