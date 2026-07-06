/**
 * Tests for useLeagueInfoTab — composes 5 parallel API calls into the
 * LeagueInfoDetail shape and exposes admin action handlers.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetLeague = jest.fn();
const mockGetLeagueMembers = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockGetLeagueJoinRequests = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockApproveJoinRequest = jest.fn();
const mockRejectJoinRequest = jest.fn();
const mockLeaveLeague = jest.fn();
const mockUpdateLeagueMember = jest.fn();
const mockRemoveLeagueMember = jest.fn();
const mockUpdateLeague = jest.fn();
const mockAddLeagueHomeCourt = jest.fn();
const mockRemoveLeagueHomeCourt = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getLeagueMembers: (...args: unknown[]) => mockGetLeagueMembers(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getLeagueJoinRequests: (...args: unknown[]) => mockGetLeagueJoinRequests(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    approveJoinRequest: (...args: unknown[]) => mockApproveJoinRequest(...args),
    rejectJoinRequest: (...args: unknown[]) => mockRejectJoinRequest(...args),
    leaveLeague: (...args: unknown[]) => mockLeaveLeague(...args),
    updateLeagueMember: (...args: unknown[]) => mockUpdateLeagueMember(...args),
    removeLeagueMember: (...args: unknown[]) => mockRemoveLeagueMember(...args),
    updateLeague: (...args: unknown[]) => mockUpdateLeague(...args),
    addLeagueHomeCourt: (...args: unknown[]) => mockAddLeagueHomeCourt(...args),
    removeLeagueHomeCourt: (...args: unknown[]) => mockRemoveLeagueHomeCourt(...args),
  },
}));

import { useLeagueInfoTab } from '@/components/screens/Leagues/useLeagueInfoTab';

const LEAGUE = {
  id: 4,
  name: 'L',
  description: 'desc',
  access_type: 'open',
  level: 'Open',
  location_id: 'socal_sd',
  location_name: 'San Diego, CA',
  home_courts: [],
};

const MEMBERS = [
  {
    id: 1,
    player_id: 1,
    player_name: 'Patrick Schwagler',
    role: 'admin',
    joined_at: '2026-01-01',
  },
  {
    id: 2,
    player_id: 2,
    player_name: 'Other Player',
    role: 'member',
    joined_at: '2026-01-02',
  },
];

const SEASONS = [
  {
    id: 10,
    name: 'Season 10',
    is_active: true,
    start_date: '2026-01-01',
    end_date: null,
    session_count: 0,
    game_count: 0,
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
      mutations: { retry: false },
    },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeague.mockResolvedValue(LEAGUE);
  mockGetLeagueMembers.mockResolvedValue(MEMBERS);
  mockGetLeagueSeasons.mockResolvedValue(SEASONS);
  mockGetLeagueJoinRequests.mockResolvedValue({ pending: [], rejected: [] });
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 1 });
});

describe('useLeagueInfoTab', () => {
  it('composes detail from parallel API calls', async () => {
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.info?.id).toBe(4);
    expect(result.current.info?.members).toHaveLength(2);
    expect(result.current.info?.members[0].display_name).toBe('Patrick Schwagler');
    expect(result.current.info?.members[0].initials).toBe('PS');
    expect(result.current.info?.seasons).toHaveLength(1);
  });

  it('maps roles: admin passes through, member and placeholder normalize to member', async () => {
    mockGetLeagueMembers.mockResolvedValue([
      ...MEMBERS,
      {
        id: 3,
        player_id: 3,
        player_name: 'Guest Player',
        role: 'placeholder',
        joined_at: '2026-01-03',
      },
    ]);

    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.info?.members[0].role).toBe('admin');
    expect(result.current.info?.members[1].role).toBe('member');
    expect(result.current.info?.members[2].role).toBe('member');
  });

  it('exposes currentPlayerId for self-detection', async () => {
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.currentPlayerId).toBe(1));
  });

  it('treats getLeagueJoinRequests 403 as empty', async () => {
    mockGetLeagueJoinRequests.mockRejectedValue(new Error('403 forbidden'));

    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.info?.join_requests).toEqual([]);
  });

  it('isError flips when getLeague rejects', async () => {
    mockGetLeague.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it('onApproveRequest calls api.approveJoinRequest with leagueId + requestId', async () => {
    mockApproveJoinRequest.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onApproveRequest(99);
    });
    expect(mockApproveJoinRequest).toHaveBeenCalledWith(4, 99);
  });

  it('onDenyRequest calls api.rejectJoinRequest', async () => {
    mockRejectJoinRequest.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onDenyRequest(100);
    });
    expect(mockRejectJoinRequest).toHaveBeenCalledWith(4, 100);
  });

  it('onChangeRole calls api.updateLeagueMember with role', async () => {
    mockUpdateLeagueMember.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onChangeRole(2, 'admin');
    });
    expect(mockUpdateLeagueMember).toHaveBeenCalledWith(4, 2, 'admin');
  });

  it('onRemovePlayer calls api.removeLeagueMember', async () => {
    mockRemoveLeagueMember.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onRemovePlayer(2);
    });
    expect(mockRemoveLeagueMember).toHaveBeenCalledWith(4, 2);
  });

  it('onUpdateAccess maps "open" to is_open=true', async () => {
    mockUpdateLeague.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onUpdateAccess('open');
    });
    expect(mockUpdateLeague).toHaveBeenCalledWith(4, { is_open: true });
  });

  it('onUpdateAccess maps "invite_only" to is_open=false', async () => {
    mockUpdateLeague.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onUpdateAccess('invite_only');
    });
    expect(mockUpdateLeague).toHaveBeenCalledWith(4, { is_open: false });
  });

  it('onAddCourt calls api.addLeagueHomeCourt', async () => {
    mockAddLeagueHomeCourt.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onAddCourt(55);
    });
    expect(mockAddLeagueHomeCourt).toHaveBeenCalledWith(4, 55);
  });

  it('onRemoveCourt calls api.removeLeagueHomeCourt', async () => {
    mockRemoveLeagueHomeCourt.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLeagueInfoTab(4), {
      wrapper: makeWrapper(makeClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onRemoveCourt(66);
    });
    expect(mockRemoveLeagueHomeCourt).toHaveBeenCalledWith(4, 66);
  });
});
