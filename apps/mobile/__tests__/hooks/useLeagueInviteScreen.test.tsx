/**
 * Tests for useLeagueInviteScreen — search, select, send invites with error surfacing.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetInvitablePlayers = jest.fn();
const mockAddLeagueMembersBatch = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    getInvitablePlayers: (...args: unknown[]) => mockGetInvitablePlayers(...args),
    addLeagueMembersBatch: (...args: unknown[]) => mockAddLeagueMembersBatch(...args),
  },
}));

import { useLeagueInviteScreen } from '@/components/screens/Leagues/useLeagueInviteScreen';
import { leagueKeys } from '@/features/leagues';
import type { InvitablePlayer } from '@beach-kings/shared';

const PLAYERS: InvitablePlayer[] = [
  {
    player_id: 1,
    display_name: 'Alpha',
    initials: 'A',
    location_name: 'NYC',
    level: 'Open',
    invite_status: 'none',
    section: 'friends',
  },
  {
    player_id: 2,
    display_name: 'Bravo',
    initials: 'B',
    location_name: 'NYC',
    level: 'Open',
    invite_status: 'none',
    section: 'friends',
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
  mockGetInvitablePlayers.mockResolvedValue(PLAYERS);
});

describe('useLeagueInviteScreen', () => {
  it('returns players from getInvitablePlayers on success', async () => {
    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.players).toEqual(PLAYERS);
  });

  it('onTogglePlayer adds and removes ids from the selectedIds set', async () => {
    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTogglePlayer(1);
    });
    expect(result.current.selectedIds.has(1)).toBe(true);

    act(() => {
      result.current.onTogglePlayer(1);
    });
    expect(result.current.selectedIds.has(1)).toBe(false);
  });

  it('onSendInvites is a no-op when no ids are selected', async () => {
    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onSendInvites();
    });

    expect(mockAddLeagueMembersBatch).not.toHaveBeenCalled();
  });

  it('onSendInvites surfaces an Error message in inviteError', async () => {
    mockAddLeagueMembersBatch.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTogglePlayer(1);
    });

    await act(async () => {
      await result.current.onSendInvites();
    });

    expect(result.current.inviteError).toBe('Network error');
    expect(result.current.isSending).toBe(false);
  });

  it('onSendInvites uses fallback message when caught value is not an Error', async () => {
    mockAddLeagueMembersBatch.mockRejectedValue('plain rejection');

    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTogglePlayer(2);
    });

    await act(async () => {
      await result.current.onSendInvites();
    });

    expect(result.current.inviteError).toMatch(/Could not add players/i);
  });

  it('onSendInvites clears selection on success and leaves inviteError null', async () => {
    mockAddLeagueMembersBatch.mockResolvedValue(undefined);

    const client = makeClient();
    client.setQueryData(leagueKeys.info(7, 7), { members: [] });
    client.setQueryData(leagueKeys.userLeagues(7), [{ id: 7, member_count: 1 }]);

    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTogglePlayer(1);
      result.current.onTogglePlayer(2);
    });

    await act(async () => {
      await result.current.onSendInvites();
    });

    expect(mockAddLeagueMembersBatch).toHaveBeenCalledWith(7, [1, 2]);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.inviteError).toBeNull();
    expect(client.getQueryState(leagueKeys.info(7, 7))?.isInvalidated).toBe(true);
    expect(client.getQueryState(leagueKeys.userLeagues(7))?.isInvalidated).toBe(true);
  });

  it('onClearInviteError resets inviteError to null', async () => {
    mockAddLeagueMembersBatch.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTogglePlayer(1);
    });

    await act(async () => {
      await result.current.onSendInvites();
    });
    expect(result.current.inviteError).toBe('boom');

    act(() => {
      result.current.onClearInviteError();
    });
    expect(result.current.inviteError).toBeNull();
  });
});
