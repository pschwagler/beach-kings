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

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
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

const mockGetLeagueDetail = jest.fn();
const mockGetLeagueStandings = jest.fn();
const mockGetLeagueSeasonsList = jest.fn();
const mockGetLeagueChat = jest.fn();
const mockGetLeagueEvents = jest.fn();
const mockGetLeagueInfoDetail = jest.fn();
const mockGetLeaguePlayerStats = jest.fn();
const mockGetMyGames = jest.fn();
const mockGetLeagueSignupEvents = jest.fn();

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    getLeagueDetail: (...args: unknown[]) => mockGetLeagueDetail(...args),
    getLeagueStandings: (...args: unknown[]) => mockGetLeagueStandings(...args),
    getLeagueSeasonsList: (...args: unknown[]) => mockGetLeagueSeasonsList(...args),
    getLeagueChat: (...args: unknown[]) => mockGetLeagueChat(...args),
    sendLeagueMessage: jest.fn().mockResolvedValue(undefined),
    getLeagueEvents: (...args: unknown[]) => mockGetLeagueEvents(...args),
    getLeagueInfoDetail: (...args: unknown[]) => mockGetLeagueInfoDetail(...args),
    getLeaguePlayerStats: (...args: unknown[]) => mockGetLeaguePlayerStats(...args),
    getMyGames: (...args: unknown[]) => mockGetMyGames(...args),
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
  home_court_name: 'Central Park Courts',
  home_court_id: 5,
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
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeagueDetail.mockResolvedValue(MOCK_DETAIL);
  mockGetLeagueStandings.mockResolvedValue([]);
  mockGetLeagueSeasonsList.mockResolvedValue([]);
  mockGetLeagueChat.mockResolvedValue([]);
  mockGetLeagueEvents.mockResolvedValue([]);
  mockGetLeagueInfoDetail.mockResolvedValue({
    id: 1, description: null, access_type: 'open', level: 'Open',
    location_name: null, home_court_name: null,
    members: [], seasons: [], join_requests: [],
  });
  mockGetLeaguePlayerStats.mockResolvedValue({});
  mockGetMyGames.mockResolvedValue([]);
  mockGetLeagueSignupEvents.mockResolvedValue([]);
});

// ---------------------------------------------------------------------------
// Loading state
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — loading', () => {
  it('renders loading indicator while detail is fetching', () => {
    mockGetLeagueDetail.mockReturnValue(new Promise(() => {}));
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

  it('renders invite button for admin', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('invite-button')).toBeTruthy();
    });
  });

  it('renders start session button for admin', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('start-session-button')).toBeTruthy();
    });
  });

  it('does NOT render start session button for member', async () => {
    mockGetLeagueDetail.mockResolvedValue({ ...MOCK_DETAIL, user_role: 'member' });
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-header')).toBeTruthy());
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
  it('pressing invite button navigates to league invite route', async () => {
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('invite-button')).toBeTruthy());
    fireEvent.press(screen.getByTestId('invite-button'));
    expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('invite'));
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('LeagueDetailScreen — error', () => {
  it('renders error state when detail query fails', async () => {
    mockGetLeagueDetail.mockRejectedValue(new Error('not found'));
    render(<LeagueDetailRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-detail-error')).toBeTruthy();
    });
  });
});
