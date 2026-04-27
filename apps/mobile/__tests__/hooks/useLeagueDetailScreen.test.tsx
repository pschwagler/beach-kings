/**
 * Tests for useLeagueDetailScreen — TanStack Query facade for the League Detail view.
 *
 * Mocks `@/lib/api` at module level. Each test wires a fresh QueryClient.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api', () => {
  const api = {
    getLeague: jest.fn(),
  };
  return { api };
});

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

import { api } from '@/lib/api';
import { useLeagueDetailScreen } from '@/components/screens/Leagues/useLeagueDetailScreen';
import type { LeagueDetail } from '@beach-kings/shared';

const mockApi = api as unknown as { getLeague: jest.Mock };

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}

const LEAGUE_DETAIL: LeagueDetail = {
  id: 42,
  name: 'Test League',
  description: 'A test league',
  access_type: 'open',
  gender: 'mens',
  level: 'Open',
  location_name: 'San Diego, CA',
  home_courts: [],
  member_count: 10,
  season_count: 2,
  current_season_id: 5,
  current_season_name: 'Summer 2025',
  is_active: true,
  user_role: 'member',
  user_rank: 3,
  user_wins: 8,
  user_losses: 2,
  user_rating: 120.5,
};

beforeEach(() => {
  mockApi.getLeague.mockReset();
});

describe('useLeagueDetailScreen', () => {
  it('returns detail from api.getLeague on success', async () => {
    mockApi.getLeague.mockResolvedValue(LEAGUE_DETAIL);
    const client = makeClient();

    const { result } = renderHook(() => useLeagueDetailScreen(42), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.detail).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.detail).toEqual(LEAGUE_DETAIL);
    expect(result.current.isError).toBe(false);
    expect(mockApi.getLeague).toHaveBeenCalledWith(42);
  });

  it('coerces string leagueId to Number when calling api.getLeague', async () => {
    mockApi.getLeague.mockResolvedValue(LEAGUE_DETAIL);
    const client = makeClient();

    renderHook(() => useLeagueDetailScreen('42'), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(mockApi.getLeague).toHaveBeenCalledWith(42));
  });

  it('sets isError on api failure', async () => {
    mockApi.getLeague.mockRejectedValue(new Error('Network error'));
    const client = makeClient();

    const { result } = renderHook(() => useLeagueDetailScreen(42), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.detail).toBeNull();
  });

  it('defaults activeTab to games', () => {
    mockApi.getLeague.mockResolvedValue(LEAGUE_DETAIL);
    const client = makeClient();

    const { result } = renderHook(() => useLeagueDetailScreen(42), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.activeTab).toBe('games');
  });

  it('onSetTab changes the active tab', async () => {
    mockApi.getLeague.mockResolvedValue(LEAGUE_DETAIL);
    const client = makeClient();

    const { result, rerender } = renderHook(() => useLeagueDetailScreen(42), {
      wrapper: makeWrapper(client),
    });

    act(() => {
      result.current.onSetTab('standings');
    });
    expect(result.current.activeTab).toBe('standings');
  });
});
