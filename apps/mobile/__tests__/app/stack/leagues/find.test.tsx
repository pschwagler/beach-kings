/**
 * Tests for the Find Leagues screen.
 *
 * Covers:
 *   - Renders search input and filter chips
 *   - Renders league result cards
 *   - Requesting to join calls the API
 *   - Loading and error states
 *   - Empty state when no results
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockPush = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('expo-router', () => ({
  useSegments: () => [],
  useRouter: () => ({ canGoBack: () => true, push: mockPush }),
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
  }),
}));

const mockQueryLeagues = jest.fn();
const mockJoinLeague = jest.fn();
const mockRequestToJoinLeague = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    queryLeagues: (...args: unknown[]) => mockQueryLeagues(...args),
    joinLeague: (...args: unknown[]) => mockJoinLeague(...args),
    requestToJoinLeague: (...args: unknown[]) => mockRequestToJoinLeague(...args),
  },
}));

// ---------------------------------------------------------------------------
// Module under test
// ---------------------------------------------------------------------------

import FindLeaguesRoute from '../../../../app/(stack)/find-leagues';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const MOCK_LEAGUES = [
  {
    id: 1,
    name: 'Manhattan Open',
    gender: 'coed',
    level: 'Open',
    access_type: 'open',
    location_name: 'Manhattan, NY',
    member_count: 24,
    friends_in_league: [],
    user_status: 'none',
  },
  {
    id: 2,
    name: 'Brooklyn AA League',
    gender: 'mens',
    level: 'AA',
    access_type: 'invite_only',
    location_name: 'Brooklyn, NY',
    member_count: 16,
    friends_in_league: [],
    user_status: 'none',
  },
];

const MOCK_RESPONSE = { items: MOCK_LEAGUES, page: 1, page_size: 25, total_count: 2 };

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryLeagues.mockResolvedValue(MOCK_RESPONSE);
  mockJoinLeague.mockResolvedValue({ success: true, message: 'Joined' });
});

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

describe('FindLeaguesScreen — render', () => {
  it('renders the find leagues screen container', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('find-leagues-screen')).toBeTruthy();
    });
  });

  it('renders the search input', () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('find-leagues-search-input')).toBeTruthy();
  });

  it('renders filter chips', () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    expect(screen.getByTestId('filter-chip-all')).toBeTruthy();
    expect(screen.getByTestId('filter-chip-public')).toBeTruthy();
  });

  it('renders league result cards after loading', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('league-result-card-1')).toBeTruthy();
      expect(screen.getByTestId('league-result-card-2')).toBeTruthy();
    });
  });

  it('renders the league list container', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('find-leagues-list')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Filter chips
// ---------------------------------------------------------------------------

describe('FindLeaguesScreen — filter chips', () => {
  it('pressing a filter chip calls queryLeagues with correct params', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('filter-chip-public')).toBeTruthy());
    fireEvent.press(screen.getByTestId('filter-chip-public'));
    await waitFor(() => {
      expect(mockQueryLeagues).toHaveBeenCalledWith(
        expect.objectContaining({ is_open: true }),
      );
    });
  });

  it('pressing "all" chip resets filters', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('filter-chip-all')).toBeTruthy());
    fireEvent.press(screen.getByTestId('filter-chip-public'));
    fireEvent.press(screen.getByTestId('filter-chip-all'));
    await waitFor(() => {
      const lastCall = mockQueryLeagues.mock.calls[mockQueryLeagues.mock.calls.length - 1][0];
      expect(lastCall?.is_open).toBeFalsy();
    });
  });
});

// ---------------------------------------------------------------------------
// Request to join
// ---------------------------------------------------------------------------

describe('FindLeaguesScreen — request to join', () => {
  it('renders request join button for open leagues', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('request-join-btn-1')).toBeTruthy();
    });
  });

  it('requests approval when the public-league action is pressed', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('request-join-btn-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('request-join-btn-1'));
    await waitFor(() => {
      expect(mockRequestToJoinLeague).toHaveBeenCalledWith(1);
    });
  });

  it('uses the invite-only card as the only route to league details', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('league-result-card-2')).toBeTruthy());

    expect(screen.queryByTestId('request-join-btn-2')).toBeNull();
    expect(screen.queryByText('View League')).toBeNull();
    expect(
      screen.getByTestId('league-result-card-2').props.accessibilityLabel,
    ).toBe('View Brooklyn AA League');
    expect(screen.getByTestId('league-result-card-2').props.accessibilityHint).toBe(
      'Opens league details',
    );

    fireEvent.press(screen.getByTestId('league-result-card-2'));

    expect(mockJoinLeague).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalled();
  });

  it('keeps open-league details and join as distinct accessible actions', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('request-join-btn-1')).toBeTruthy());

    expect(
      screen.getByTestId('league-result-card-1').props.accessibilityLabel,
    ).toBe('View Manhattan Open');
    expect(
      screen.getByTestId('request-join-btn-1').props.accessibilityLabel,
    ).toBe('Request to join Manhattan Open');
    expect(screen.getByTestId('request-join-btn-1').props.accessibilityHint).toBe(
      'Sends a request for league admin approval',
    );
  });

  it.each([
    [
      '400',
      { response: { status: 400, data: { detail: 'Invalid join request' } } },
      'We could not request to join this league',
    ],
    [
      '403',
      { response: { status: 403, data: { detail: 'Forbidden' } } },
      'You do not have permission',
    ],
    [
      'duplicate request',
      {
        response: {
          status: 400,
          data: { detail: 'A request already exists and is pending' },
        },
      },
      'Your request is already pending',
    ],
    [
      'offline',
      new Error('Network Error'),
      'You appear to be offline',
    ],
  ])('rolls back and shows product feedback for a %s failure', async (
    _label,
    error,
    expectedCopy,
  ) => {
    mockRequestToJoinLeague.mockRejectedValueOnce(error);
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('request-join-btn-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('request-join-btn-1'));

    await waitFor(() => {
      expect(screen.getByTestId('join-league-error-1')).toHaveTextContent(
        expectedCopy as string,
      );
      expect(screen.getByText('Try Again')).toBeTruthy();
      expect(screen.queryByText("You're a Member")).toBeNull();
    });
  });

  it('clears join feedback when navigating to the league', async () => {
    mockRequestToJoinLeague.mockRejectedValueOnce(new Error('Network Error'));
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('request-join-btn-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('request-join-btn-1'));
    await waitFor(() => expect(screen.getByTestId('join-league-error-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('league-result-card-1'));

    expect(mockPush).toHaveBeenCalled();
    expect(screen.queryByTestId('join-league-error-1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('FindLeaguesScreen — empty state', () => {
  it('renders empty state when no leagues found', async () => {
    mockQueryLeagues.mockResolvedValue({ items: [], page: 1, page_size: 25, total_count: 0 });
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('find-leagues-empty')).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------

describe('FindLeaguesScreen — error state', () => {
  it('renders error state when query fails', async () => {
    mockQueryLeagues.mockRejectedValue(new Error('network error'));
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('find-leagues-error')).toBeTruthy();
    });
  });
});
