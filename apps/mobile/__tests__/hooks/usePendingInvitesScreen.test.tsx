/**
 * Tests for usePendingInvitesScreen — fetches sent league invites for the current user.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetMySentLeagueInvites = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getMySentLeagueInvites: (...args: unknown[]) => mockGetMySentLeagueInvites(...args),
  },
}));

import { usePendingInvitesScreen } from '@/components/screens/Leagues/usePendingInvitesScreen';
import type { LeagueInviteItem } from '@beach-kings/shared';

const MOCK_INVITES: LeagueInviteItem[] = [
  {
    id: 1,
    league_id: 10,
    league_name: 'QBK Open Men',
    player_id: 50,
    display_name: 'D. Thompson',
    initials: 'DT',
    invited_at: '2026-03-15T00:00:00+00:00',
    status: 'pending',
  },
  {
    id: 2,
    league_id: 10,
    league_name: 'QBK Open Men',
    player_id: 51,
    display_name: 'R. Martinez',
    initials: 'RM',
    invited_at: '2026-03-16T00:00:00+00:00',
    status: 'accepted',
  },
];

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

beforeEach(() => {
  jest.clearAllMocks();
});

describe('usePendingInvitesScreen', () => {
  it('returns invites from getMySentLeagueInvites on success', async () => {
    mockGetMySentLeagueInvites.mockResolvedValue(MOCK_INVITES);

    const { result } = renderHook(() => usePendingInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.invites).toEqual(MOCK_INVITES);
    expect(result.current.isError).toBe(false);
  });

  it('returns empty array while loading', () => {
    mockGetMySentLeagueInvites.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => usePendingInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    expect(result.current.invites).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns empty array on success with no invites', async () => {
    mockGetMySentLeagueInvites.mockResolvedValue([]);

    const { result } = renderHook(() => usePendingInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.invites).toEqual([]);
  });

  it('sets isError on failure', async () => {
    mockGetMySentLeagueInvites.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePendingInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.invites).toEqual([]);
  });

  it('calls getMySentLeagueInvites once on mount', async () => {
    mockGetMySentLeagueInvites.mockResolvedValue(MOCK_INVITES);

    renderHook(() => usePendingInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(mockGetMySentLeagueInvites).toHaveBeenCalledTimes(1));
  });
});
