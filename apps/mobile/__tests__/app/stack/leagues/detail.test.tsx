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
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, replace: mockReplace }),
  useLocalSearchParams: () => ({ id: '1' }),
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

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ isDark: false, theme: 'light', setTheme: jest.fn() }),
}));

jest.mock('@/contexts/NotificationContext', () => ({
  useNotifications: () => ({ unreadCount: 0, refresh: jest.fn() }),
}));

const mockGetLeagueDetail = jest.fn();
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
const mockGetLeagueSignupEvents = jest.fn();
const mockGetLeague = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetLeagueJoinRequests = jest.fn();
const mockApproveJoinRequest = jest.fn();
const mockRejectJoinRequest = jest.fn();
const mockRequestToJoinLeague = jest.fn();

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
  },
}));

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    getLeagueDetail: (...args: unknown[]) => mockGetLeagueDetail(...args),
    getLeagueSignupEvents: (...args: unknown[]) => mockGetLeagueSignupEvents(...args),
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
  mockGetLeagueSignupEvents.mockResolvedValue([]);
  mockGetLeagueMembers.mockResolvedValue([]);
  mockGetLeagueJoinRequests.mockResolvedValue({ pending: [], rejected: [] });
  mockApproveJoinRequest.mockResolvedValue({ success: true });
  mockRejectJoinRequest.mockResolvedValue({ success: true });
  mockRequestToJoinLeague.mockResolvedValue({ success: true, message: 'ok' });
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
  it('renders league name in header', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-header-name')).toBeTruthy();
    });
    expect(screen.getByTestId('league-header-name').props.children).toBe('Manhattan Open');
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

  it('renders all 5 tab buttons', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-segment-bar')).toBeTruthy());
    expect(screen.getByTestId('segment-tab-games')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-standings')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-chat')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-signups')).toBeTruthy();
    expect(screen.getByTestId('segment-tab-info')).toBeTruthy();
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

  it('switches to signups tab on press', async () => {
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
  it('renders error state when detail query fails', async () => {
    mockGetLeague.mockRejectedValue(new Error('not found'));
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-detail-error')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Signups tab — real API integration
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — signups tab', () => {
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

  it('renders a Request to join CTA for an open league', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-banner')).toBeTruthy());
    expect(screen.getByTestId('league-join-btn')).toBeTruthy();
  });

  it('calls requestToJoinLeague when the CTA is pressed', async () => {
    mockGetLeague.mockResolvedValue(VISITOR_DETAIL);
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-btn')).toBeTruthy());
    fireEvent.press(screen.getByTestId('league-join-btn'));
    await waitFor(() => expect(mockRequestToJoinLeague).toHaveBeenCalledWith(1));
  });

  it('shows "Invite only" for an invite-only league (no join button)', async () => {
    mockGetLeague.mockResolvedValue({ ...VISITOR_DETAIL, access_type: 'invite_only' });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-banner')).toBeTruthy());
    expect(screen.getByTestId('league-join-invite-only')).toBeTruthy();
    expect(screen.queryByTestId('league-join-btn')).toBeNull();
  });

  it('shows "Request sent" when a request is already pending', async () => {
    mockGetLeague.mockResolvedValue({ ...VISITOR_DETAIL, has_pending_request: true });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-join-banner')).toBeTruthy());
    expect(screen.getByTestId('league-join-pending')).toBeTruthy();
    expect(screen.queryByTestId('league-join-btn')).toBeNull();
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
});
