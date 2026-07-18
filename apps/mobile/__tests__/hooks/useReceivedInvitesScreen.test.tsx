/**
 * Tests for useReceivedInvitesScreen — fetches received league invites,
 * supports optimistic accept/decline, and restores rows on error.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetReceivedLeagueInvites = jest.fn();
const mockAcceptLeagueInvite = jest.fn();
const mockDeclineLeagueInvite = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
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

import { useReceivedInvitesScreen } from '@/components/screens/Leagues/useReceivedInvitesScreen';
import type { LeagueInviteItem } from '@beach-kings/shared';
import { Alert } from 'react-native';

jest.spyOn(Alert, 'alert');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_INVITES: LeagueInviteItem[] = [
  {
    id: 1,
    league_id: 10,
    league_name: 'Manhattan Open',
    player_id: 60,
    display_name: 'Jake Donovan',
    initials: 'JD',
    invited_at: '2025-06-01T12:00:00Z',
    status: 'pending',
  },
  {
    id: 2,
    league_id: 11,
    league_name: 'Brooklyn AA',
    player_id: 61,
    display_name: 'Sam Joustra',
    initials: 'SJ',
    invited_at: '2025-05-20T10:00:00Z',
    status: 'pending',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    },
  });
}

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetReceivedLeagueInvites.mockResolvedValue(MOCK_INVITES);
  mockAcceptLeagueInvite.mockResolvedValue({ status: 'accepted' });
  mockDeclineLeagueInvite.mockResolvedValue({ status: 'declined' });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useReceivedInvitesScreen', () => {
  it('returns invites from getReceivedLeagueInvites on success', async () => {
    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.invites).toEqual(MOCK_INVITES);
    expect(result.current.isError).toBe(false);
  });

  it('returns empty array and isLoading=true while fetching', () => {
    mockGetReceivedLeagueInvites.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    expect(result.current.invites).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  it('returns empty array on success with no invites', async () => {
    mockGetReceivedLeagueInvites.mockResolvedValue([]);

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.invites).toEqual([]);
  });

  it('sets isError on failure', async () => {
    mockGetReceivedLeagueInvites.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isError).toBe(true);
    expect(result.current.invites).toEqual([]);
  });

  it('onAccept optimistically removes the invite row', async () => {
    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.invites).toHaveLength(2);

    await act(async () => {
      await result.current.onAccept(10);
    });

    expect(mockAcceptLeagueInvite).toHaveBeenCalledWith(10);
    // Row with league_id 10 is removed.
    expect(result.current.invites.find((i) => i.league_id === 10)).toBeUndefined();
    // Row with league_id 11 remains.
    expect(result.current.invites.find((i) => i.league_id === 11)).toBeDefined();
  });

  it('onDecline optimistically removes the invite row', async () => {
    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onDecline(11);
    });

    expect(mockDeclineLeagueInvite).toHaveBeenCalledWith(11);
    expect(result.current.invites.find((i) => i.league_id === 11)).toBeUndefined();
    expect(result.current.invites.find((i) => i.league_id === 10)).toBeDefined();
  });

  it('marks leagueId as responding while in-flight', async () => {
    let resolveAccept!: () => void;
    mockAcceptLeagueInvite.mockReturnValue(
      new Promise<{ status: string }>((res) => {
        resolveAccept = () => res({ status: 'accepted' });
      }),
    );

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    // Start accept but don't await — check in-flight state.
    let acceptPromise!: Promise<void>;
    act(() => {
      acceptPromise = result.current.onAccept(10);
    });

    expect(result.current.respondingIds.has(10)).toBe(true);

    await act(async () => {
      resolveAccept();
      await acceptPromise;
    });

    expect(result.current.respondingIds.has(10)).toBe(false);
  });

  it('shows generic Alert (not raw error) and restores row when accept fails', async () => {
    mockAcceptLeagueInvite.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onAccept(10);
    });

    // Row is restored after error.
    expect(result.current.invites.find((i) => i.league_id === 10)).toBeDefined();
    // Raw backend error must NOT leak to the user — always show the generic copy.
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not accept the invite. Please try again.',
    );
  });

  it('shows generic Alert (not raw error) and restores row when decline fails', async () => {
    mockDeclineLeagueInvite.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onDecline(11);
    });

    expect(result.current.invites.find((i) => i.league_id === 11)).toBeDefined();
    // Raw backend error must NOT leak to the user.
    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      'Could not decline the invite. Please try again.',
    );
  });

  it('shows fallback message in Alert when reject value is not an Error', async () => {
    mockDeclineLeagueInvite.mockRejectedValue('plain rejection');

    const { result } = renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onDecline(11);
    });

    expect(Alert.alert).toHaveBeenCalledWith(
      'Error',
      expect.stringMatching(/Could not decline/i),
    );
  });

  it('calls getReceivedLeagueInvites once on mount', async () => {
    renderHook(() => useReceivedInvitesScreen(), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() =>
      expect(mockGetReceivedLeagueInvites).toHaveBeenCalledTimes(1),
    );
  });
});
