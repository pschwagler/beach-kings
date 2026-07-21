import React from 'react';
import { act, renderHook as testingRenderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SessionDetail } from '@beach-kings/shared';

const mockGetSessionById = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockUpdateSession = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@/utils/haptics', () => ({ hapticMedium: jest.fn().mockResolvedValue(undefined) }));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

import { useSessionEditScreen } from '@/components/screens/Sessions/useSessionEditScreen';

const session: SessionDetail = {
  id: 5,
  code: 'BK5TEST2',
  season_id: null,
  league_id: null,
  league_name: null,
  court_id: 21,
  court_name: 'Court B',
  date: '2026-04-10',
  start_time: '17:00',
  session_number: 1,
  status: 'active',
  session_type: 'pickup',
  is_ranked: false,
  players: [],
  games: [],
  user_wins: 0,
  user_losses: 0,
  user_rating_change: null,
};

let queryClient: QueryClient;

function renderHook<Result>(callback: () => Result) {
  const wrapper = ({ children }: { children: React.ReactNode }): React.ReactElement => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return testingRenderHook(callback, { wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  mockGetSessionById.mockResolvedValue(session);
  mockGetLeagueSeasons.mockResolvedValue([{ id: 10, name: 'Spring 2026', is_active: true }]);
});

describe('useSessionEditScreen', () => {
  it('pre-fills editable date, time, court ID, and ranked state', async () => {
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));

    expect(result.current.startTime).toBe('17:00');
    expect(result.current.courtId).toBe(21);
    expect(result.current.isRanked).toBe(false);
  });

  it('updates with court_id and is_ranked without legacy writable fields', async () => {
    mockUpdateSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.courtId).toBe(21));
    act(() => {
      result.current.setCourtId(44);
      result.current.setIsRanked(true);
    });

    await act(async () => { await result.current.onSave(); });

    expect(mockUpdateSession).toHaveBeenCalledWith(5, {
      date: '2026-04-10',
      start_time: '17:00',
      court_id: 44,
      is_ranked: true,
    });
    const payload = mockUpdateSession.mock.calls[0][1];
    expect(payload).not.toHaveProperty('court_name');
    expect(payload).not.toHaveProperty('session_type');
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('loads and saves a season-scoped league session as ranked', async () => {
    mockGetSessionById.mockResolvedValue({ ...session, league_id: 3, league_name: 'QBK Open Men', season_id: 10, is_ranked: false });
    mockUpdateSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionEditScreen(5));

    await waitFor(() => expect(result.current.selectedSeasonId).toBe(10));
    expect(result.current.isRanked).toBe(true);
    expect(result.current.isRankedLocked).toBe(true);
    expect(mockGetLeagueSeasons).toHaveBeenCalledWith(3);

    act(() => result.current.setIsRanked(false));
    expect(result.current.isRanked).toBe(true);

    await act(async () => { await result.current.onSave(); });
    expect(mockUpdateSession).toHaveBeenCalledWith(5, expect.objectContaining({
      season_id: 10,
      is_ranked: true,
    }));
  });

  it('allows casual sessions after the season assignment is cleared', async () => {
    mockGetSessionById.mockResolvedValue({ ...session, league_id: 3, season_id: 10 });
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.isRankedLocked).toBe(true));

    act(() => result.current.setSelectedSeasonId(null));
    expect(result.current.isRankedLocked).toBe(false);
    act(() => result.current.setIsRanked(false));
    expect(result.current.isRanked).toBe(false);
  });
});
