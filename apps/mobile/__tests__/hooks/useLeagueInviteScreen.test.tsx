/**
 * Tests for useLeagueInviteScreen — search, select, send invites with error
 * surfacing. Validates that the previously-silent throw from
 * mockApi.sendLeagueInvites now reaches the user via inviteError.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetInvitablePlayers = jest.fn();
const mockSendLeagueInvites = jest.fn();

jest.mock('@/lib/mockApi', () => ({
  mockApi: {
    getInvitablePlayers: (...args: unknown[]) =>
      mockGetInvitablePlayers(...args),
    sendLeagueInvites: (...args: unknown[]) => mockSendLeagueInvites(...args),
  },
}));

import { useLeagueInviteScreen } from '@/components/screens/Leagues/useLeagueInviteScreen';
import type { InvitablePlayer } from '@/lib/mockApi';

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

    expect(mockSendLeagueInvites).not.toHaveBeenCalled();
  });

  it('onSendInvites surfaces an Error message in inviteError', async () => {
    mockSendLeagueInvites.mockRejectedValue(
      new Error('TODO(backend): POST /api/leagues/:id/invites'),
    );

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

    expect(result.current.inviteError).toMatch(/TODO\(backend\)/);
    expect(result.current.isSending).toBe(false);
  });

  it('onSendInvites uses fallback message when caught value is not an Error', async () => {
    mockSendLeagueInvites.mockRejectedValue('plain rejection');

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

    expect(result.current.inviteError).toMatch(/Could not send invites/i);
  });

  it('onSendInvites clears selection on success and leaves inviteError null', async () => {
    mockSendLeagueInvites.mockResolvedValue({ status: 'ok' });

    const { result } = renderHook(() => useLeagueInviteScreen(7), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onTogglePlayer(1);
      result.current.onTogglePlayer(2);
    });

    await act(async () => {
      await result.current.onSendInvites();
    });

    expect(mockSendLeagueInvites).toHaveBeenCalledWith(7, [1, 2]);
    expect(result.current.selectedIds.size).toBe(0);
    expect(result.current.inviteError).toBeNull();
  });

  it('onClearInviteError resets inviteError to null', async () => {
    mockSendLeagueInvites.mockRejectedValue(new Error('boom'));

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
