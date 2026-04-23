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

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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

const mockFindLeagues = jest.fn();
const mockRequestToJoin = jest.fn();

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    findLeagues: (...args: unknown[]) => mockFindLeagues(...args),
    requestToJoinLeague: (...args: unknown[]) => mockRequestToJoin(...args),
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
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
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
    friends_in_league: 2,
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
    friends_in_league: 0,
    user_status: 'none',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockFindLeagues.mockResolvedValue(MOCK_LEAGUES);
  mockRequestToJoin.mockResolvedValue(undefined);
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
  it('pressing a filter chip calls findLeagues with correct params', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('filter-chip-public')).toBeTruthy());
    fireEvent.press(screen.getByTestId('filter-chip-public'));
    await waitFor(() => {
      expect(mockFindLeagues).toHaveBeenCalledWith(
        expect.objectContaining({ access_type: 'open' }),
      );
    });
  });

  it('pressing "all" chip resets filters', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('filter-chip-all')).toBeTruthy());
    fireEvent.press(screen.getByTestId('filter-chip-public'));
    fireEvent.press(screen.getByTestId('filter-chip-all'));
    await waitFor(() => {
      const lastCall = mockFindLeagues.mock.calls[mockFindLeagues.mock.calls.length - 1][0];
      expect(lastCall?.access_type).toBeFalsy();
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

  it('calls requestToJoinLeague when join button pressed', async () => {
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => expect(screen.getByTestId('request-join-btn-1')).toBeTruthy());
    fireEvent.press(screen.getByTestId('request-join-btn-1'));
    await waitFor(() => {
      expect(mockRequestToJoin).toHaveBeenCalledWith(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

describe('FindLeaguesScreen — empty state', () => {
  it('renders empty state when no leagues found', async () => {
    mockFindLeagues.mockResolvedValue([]);
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
    mockFindLeagues.mockRejectedValue(new Error('network error'));
    render(<FindLeaguesRoute />, { wrapper: makeWrapper() });
    await waitFor(() => {
      expect(screen.getByTestId('find-leagues-error')).toBeTruthy();
    });
  });
});
