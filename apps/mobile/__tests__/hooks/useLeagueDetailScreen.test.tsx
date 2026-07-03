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
    requestToJoinLeague: jest.fn(),
  };
  return { api };
});

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: jest.fn() })),
}));

import { api } from '@/lib/api';
import { useLeagueDetailScreen } from '@/components/screens/Leagues/useLeagueDetailScreen';
import type { LeagueDetail } from '@beach-kings/shared';

const mockApi = api as unknown as {
  getLeague: jest.Mock;
  requestToJoinLeague: jest.Mock;
};

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
  location_id: 'socal_sd',
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
  has_pending_request: false,
};

/** A non-member view of an open league. */
const VISITOR_OPEN: LeagueDetail = {
  ...LEAGUE_DETAIL,
  user_role: null,
  user_rank: null,
  user_wins: null,
  user_losses: null,
  user_rating: null,
  has_pending_request: false,
};

beforeEach(() => {
  mockApi.getLeague.mockReset();
  mockApi.requestToJoinLeague.mockReset();
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

  describe('member vs visitor', () => {
    it('a member sees all tabs and is not a visitor', async () => {
      mockApi.getLeague.mockResolvedValue(LEAGUE_DETAIL);
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isVisitor).toBe(false);
      expect(result.current.visibleTabs).toEqual([
        'games',
        'standings',
        'chat',
        'signups',
        'info',
      ]);
    });

    it('a visitor sees only standings + info', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.isVisitor).toBe(true);
      expect(result.current.visibleTabs).toEqual(['standings', 'info']);
    });

    it('clamps the default games tab to standings for a visitor', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      // Default raw tab is 'games' (hidden for visitors) → clamped to 'standings'.
      await waitFor(() => expect(result.current.activeTab).toBe('standings'));
    });
  });

  describe('join CTA', () => {
    it('an open-league visitor can request to join', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.canRequestToJoin).toBe(true);
      expect(result.current.isInviteOnly).toBe(false);
      expect(result.current.hasPendingRequest).toBe(false);
    });

    it('an invite-only visitor cannot self-serve join', async () => {
      mockApi.getLeague.mockResolvedValue({
        ...VISITOR_OPEN,
        access_type: 'invite_only',
      });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.canRequestToJoin).toBe(false);
      expect(result.current.isInviteOnly).toBe(true);
    });

    it('a visitor with a pending request cannot request again', async () => {
      mockApi.getLeague.mockResolvedValue({
        ...VISITOR_OPEN,
        has_pending_request: true,
      });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.hasPendingRequest).toBe(true);
      expect(result.current.canRequestToJoin).toBe(false);
    });

    it('onRequestToJoin calls the API and optimistically flips the flag', async () => {
      // Initial load: no pending request. The post-request invalidation refetch
      // reflects the server now showing the pending request.
      mockApi.getLeague
        .mockResolvedValueOnce(VISITOR_OPEN)
        .mockResolvedValue({ ...VISITOR_OPEN, has_pending_request: true });
      mockApi.requestToJoinLeague.mockResolvedValue({ success: true, message: 'ok' });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.canRequestToJoin).toBe(true));
      await act(async () => {
        await result.current.onRequestToJoin();
      });

      expect(mockApi.requestToJoinLeague).toHaveBeenCalledWith(42);
      expect(result.current.hasPendingRequest).toBe(true);
      expect(result.current.canRequestToJoin).toBe(false);
    });

    it('rolls back the optimistic flag if the request fails', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      mockApi.requestToJoinLeague.mockRejectedValue(new Error('boom'));
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.canRequestToJoin).toBe(true));
      await act(async () => {
        await expect(result.current.onRequestToJoin()).rejects.toThrow('boom');
      });

      expect(result.current.hasPendingRequest).toBe(false);
    });
  });
});
