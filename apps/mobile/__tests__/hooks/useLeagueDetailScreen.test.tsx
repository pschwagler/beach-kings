/**
 * Tests for useLeagueDetailScreen — TanStack Query facade for the League Detail view.
 *
 * Mocks `@/lib/api` at module level. Each test wires a fresh QueryClient.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => {
  const api = {
    getLeague: jest.fn(),
    requestToJoinLeague: jest.fn(),
    joinLeague: jest.fn(),
    getReceivedLeagueInvites: jest.fn(),
    acceptLeagueInvite: jest.fn(),
    declineLeagueInvite: jest.fn(),
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
  joinLeague: jest.Mock;
  getReceivedLeagueInvites: jest.Mock;
  acceptLeagueInvite: jest.Mock;
  declineLeagueInvite: jest.Mock;
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
  is_public: true,
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

/** A non-member view of an open (directly joinable) public league. */
const VISITOR_OPEN: LeagueDetail = {
  ...LEAGUE_DETAIL,
  user_role: null,
  user_rank: null,
  user_wins: null,
  user_losses: null,
  user_rating: null,
  has_pending_request: false,
};

/** A non-member view of an invite-only league (request-to-join required). */
const VISITOR_INVITE_ONLY: LeagueDetail = {
  ...VISITOR_OPEN,
  access_type: 'invite_only',
};

const RECEIVED_INVITE = {
  id: 9,
  league_id: 42,
  league_name: 'Test League',
  player_id: 7,
  display_name: 'Test Player',
  initials: 'TL',
  invited_at: '2026-08-24T12:00:00Z',
  status: 'pending' as const,
};

beforeEach(() => {
  mockApi.getLeague.mockReset();
  mockApi.requestToJoinLeague.mockReset();
  mockApi.joinLeague.mockReset();
  mockApi.getReceivedLeagueInvites.mockReset();
  mockApi.acceptLeagueInvite.mockReset();
  mockApi.declineLeagueInvite.mockReset();
  mockApi.getReceivedLeagueInvites.mockResolvedValue([]);
  mockApi.acceptLeagueInvite.mockResolvedValue({ status: 'accepted' });
  mockApi.declineLeagueInvite.mockResolvedValue({ status: 'declined' });
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
      // 'signups' is temporarily disabled (needs a web-admin season/schedule;
      // renders empty on mobile). Re-add here + in MEMBER_TABS to restore.
      expect(result.current.visibleTabs).toEqual([
        'games',
        'standings',
        'chat',
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

  describe('join CTA — access_type routing', () => {
    it('an open-league visitor can join directly, not request to join', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.canJoinDirectly).toBe(true);
      expect(result.current.canRequestToJoin).toBe(false);
      expect(result.current.isInviteOnly).toBe(false);
      expect(result.current.hasPendingRequest).toBe(false);
    });

    it('an invite-only visitor can request to join, not join directly', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_INVITE_ONLY);
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.canJoinDirectly).toBe(false);
      expect(result.current.canRequestToJoin).toBe(true);
      expect(result.current.isInviteOnly).toBe(true);
    });

    it('an invite-only visitor with a pending request cannot request again', async () => {
      mockApi.getLeague.mockResolvedValue({
        ...VISITOR_INVITE_ONLY,
        has_pending_request: true,
      });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.hasPendingRequest).toBe(true);
      expect(result.current.canRequestToJoin).toBe(false);
      expect(result.current.canJoinDirectly).toBe(false);
    });
  });

  describe('received invitation composition', () => {
    it('distinguishes a matching visitor invitation from generic join eligibility', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      mockApi.getReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(makeClient()),
      });

      await waitFor(() => expect(result.current.hasLeagueInvitation).toBe(true));
      expect(result.current.isVisitor).toBe(true);
      expect(result.current.isRespondingToInvitation).toBe(false);
    });

    it('ignores an invitation for a different league and for an existing member', async () => {
      mockApi.getReceivedLeagueInvites.mockResolvedValue([
        { ...RECEIVED_INVITE, league_id: 99 },
      ]);
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      const visitor = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(makeClient()),
      });
      await waitFor(() => expect(visitor.result.current.isLoading).toBe(false));
      expect(visitor.result.current.hasLeagueInvitation).toBe(false);
      visitor.unmount();

      mockApi.getReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
      mockApi.getLeague.mockResolvedValue(LEAGUE_DETAIL);
      const member = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(makeClient()),
      });
      await waitFor(() => expect(member.result.current.isLoading).toBe(false));
      expect(member.result.current.hasLeagueInvitation).toBe(false);
    });

    it('keeps invitation state during accept and refreshes detail before settling', async () => {
      let resolveAccept!: (value: { status: string }) => void;
      let resolveDetailRefresh!: (value: LeagueDetail) => void;
      mockApi.getLeague
        .mockResolvedValueOnce(VISITOR_OPEN)
        .mockReturnValueOnce(
          new Promise((resolve) => {
            resolveDetailRefresh = resolve;
          }),
        );
      mockApi.getReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
      mockApi.acceptLeagueInvite.mockReturnValue(
        new Promise((resolve) => {
          resolveAccept = resolve;
        }),
      );
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });
      await waitFor(() => expect(result.current.hasLeagueInvitation).toBe(true));

      let acceptPromise!: Promise<void>;
      act(() => {
        acceptPromise = result.current.onAcceptInvitation();
      });
      await waitFor(() => {
        expect(result.current.isRespondingToInvitation).toBe(true);
        expect(result.current.hasLeagueInvitation).toBe(true);
      });

      act(() => {
        resolveAccept({ status: 'accepted' });
      });
      // The authoritative accept response updates cached membership before
      // the detail refresh completes, so the generic visitor CTA never flashes.
      await waitFor(() => expect(result.current.isVisitor).toBe(false));
      expect(result.current.hasLeagueInvitation).toBe(false);
      expect(mockApi.getLeague).toHaveBeenCalledTimes(2);

      await act(async () => {
        resolveDetailRefresh({ ...LEAGUE_DETAIL, user_role: 'member' });
        await acceptPromise;
      });
    });

    it('removes a declined invitation without changing generic detail', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      mockApi.getReceivedLeagueInvites.mockResolvedValue([RECEIVED_INVITE]);
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(makeClient()),
      });
      await waitFor(() => expect(result.current.hasLeagueInvitation).toBe(true));

      await act(async () => {
        await result.current.onDeclineInvitation();
      });

      expect(mockApi.declineLeagueInvite).toHaveBeenCalledWith(42);
      expect(result.current.hasLeagueInvitation).toBe(false);
      expect(result.current.canJoinDirectly).toBe(true);
      expect(mockApi.getLeague).toHaveBeenCalledTimes(1);
    });
  });

  describe('onRequestToJoin (invite-only leagues)', () => {
    it('calls api.requestToJoinLeague (not joinLeague) and optimistically flips the flag', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_INVITE_ONLY);
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
      expect(mockApi.joinLeague).not.toHaveBeenCalled();
      expect(result.current.hasPendingRequest).toBe(true);
      expect(result.current.canRequestToJoin).toBe(false);
      // The optimistic update already reflects server state — no redundant
      // refetch on the happy path.
      expect(mockApi.getLeague).toHaveBeenCalledTimes(1);
    });

    it('rolls back the optimistic flag and reconciles with the server if the request fails', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_INVITE_ONLY);
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

  describe('onJoinLeague (open leagues)', () => {
    it('calls api.joinLeague (not requestToJoinLeague) and refetches on success', async () => {
      mockApi.getLeague
        .mockResolvedValueOnce(VISITOR_OPEN)
        .mockResolvedValue({ ...VISITOR_OPEN, user_role: 'member' });
      mockApi.joinLeague.mockResolvedValue({ success: true, message: 'Joined!' });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.canJoinDirectly).toBe(true));
      await act(async () => {
        await result.current.onJoinLeague();
      });

      expect(mockApi.joinLeague).toHaveBeenCalledWith(42);
      expect(mockApi.requestToJoinLeague).not.toHaveBeenCalled();
      // A direct join changes membership — the detail is refetched so
      // user_role (and therefore isVisitor / visibleTabs) update.
      await waitFor(() => expect(result.current.isVisitor).toBe(false));
    });

    it('does not refetch when onJoinLeague fails', async () => {
      mockApi.getLeague.mockResolvedValue(VISITOR_OPEN);
      mockApi.joinLeague.mockRejectedValue(new Error('boom'));
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.canJoinDirectly).toBe(true));
      await act(async () => {
        await expect(result.current.onJoinLeague()).rejects.toThrow('boom');
      });

      expect(mockApi.getLeague).toHaveBeenCalledTimes(1);
      expect(result.current.isVisitor).toBe(true);
    });
  });

  describe('standings tab gating for private leagues', () => {
    it('hides the standings tab for a visitor of a private league', async () => {
      mockApi.getLeague.mockResolvedValue({ ...VISITOR_OPEN, is_public: false });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.visibleTabs).toEqual(['info']);
    });

    it('keeps the standings tab for a visitor of a public league', async () => {
      mockApi.getLeague.mockResolvedValue({ ...VISITOR_OPEN, is_public: true });
      const client = makeClient();
      const { result } = renderHook(() => useLeagueDetailScreen(42), {
        wrapper: makeWrapper(client),
      });

      await waitFor(() => expect(result.current.isVisitor).toBe(true));
      expect(result.current.visibleTabs).toEqual(['standings', 'info']);
    });
  });
});
