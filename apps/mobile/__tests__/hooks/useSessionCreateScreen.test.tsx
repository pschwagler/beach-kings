import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCreateSession = jest.fn();
const mockGetLeague = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockReplace = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockGetPlayerHomeCourts = jest.fn();
const mockGetPlaceholderCourt = jest.fn();
const mockUpdatePlayerProfile = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
    getPlayerHomeCourts: (...args: unknown[]) => mockGetPlayerHomeCourts(...args),
    getPlaceholderCourt: (...args: unknown[]) => mockGetPlaceholderCourt(...args),
    updatePlayerProfile: (...args: unknown[]) => mockUpdatePlayerProfile(...args),
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/utils/haptics', () => ({ hapticMedium: jest.fn().mockResolvedValue(undefined) }));

import { useSessionCreateScreen } from '@/components/screens/Sessions/useSessionCreateScreen';
import { playerKeys } from '@/features/player';

let queryClient: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  jest.clearAllMocks();
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockGetLeague.mockResolvedValue({ id: 3, name: 'QBK Open Men' });
  mockGetLeagueSeasons.mockResolvedValue([{ id: 8, name: 'Spring 2026', is_active: true }]);
  mockGetCurrentUserPlayer.mockResolvedValue({ id: 44, location_id: 'montreal' });
  mockGetPlayerHomeCourts.mockResolvedValue([
    { id: 12, name: 'Home Beach', position: 0 },
  ]);
  mockGetPlaceholderCourt.mockResolvedValue({ id: 90, name: 'Other / Private Court' });
  mockUpdatePlayerProfile.mockImplementation(async (updates) => ({ id: 44, ...updates }));
});

describe('useSessionCreateScreen', () => {
  it('suggests the first home court but does not confirm it', async () => {
    const { result } = renderHook(() => useSessionCreateScreen(), { wrapper });

    await waitFor(() => expect(result.current.courtId).toBe(12));
    expect(result.current.courtName).toBe('Home Beach');
    expect(result.current.courtConfirmed).toBe(false);
    expect(result.current.selectedSeasonId).toBeNull();
    expect(result.current.isRanked).toBe(true);
    expect(result.current.isRankedLocked).toBe(false);
  });

  it('updates date, start time, court ID, and ranked state', () => {
    const { result } = renderHook(() => useSessionCreateScreen(), { wrapper });
    act(() => {
      result.current.setDate('2026-05-01');
      result.current.setStartTime('18:00');
      result.current.setCourtId(42);
      result.current.setIsRanked(false);
    });

    expect(result.current.date).toBe('2026-05-01');
    expect(result.current.startTime).toBe('18:00');
    expect(result.current.courtId).toBe(42);
    expect(result.current.courtConfirmed).toBe(true);
    expect(result.current.isRanked).toBe(false);
  });

  it('submits court_id and omits legacy writable fields', async () => {
    mockCreateSession.mockResolvedValue({ id: 99 });
    const { result } = renderHook(() => useSessionCreateScreen(), { wrapper });
    act(() => {
      result.current.setStartTime('18:00');
      result.current.setCourtId(42);
      result.current.setIsRanked(false);
    });

    await act(async () => { await result.current.onSubmit(); });

    expect(mockCreateSession).toHaveBeenCalledWith({
      date: expect.any(String),
      start_time: '18:00',
      court_id: 42,
      is_ranked: false,
    });
    const payload = mockCreateSession.mock.calls[0][0];
    expect(payload).not.toHaveProperty('court_name');
    expect(payload).not.toHaveProperty('session_type');
    expect(mockReplace).toHaveBeenCalledWith('/(stack)/session/99');
  });

  it('loads league context and submits the selected season', async () => {
    mockCreateSession.mockResolvedValue({ id: 99 });
    const { result } = renderHook(() => useSessionCreateScreen({ leagueId: 3, seasonId: 8 }), { wrapper });

    await waitFor(() => expect(result.current.leagueName).toBe('QBK Open Men'));
    await waitFor(() => expect(result.current.leagueSeasons).toHaveLength(1));
    expect(result.current.selectedSeasonId).toBe(8);
    expect(result.current.isRankedLocked).toBe(true);
    expect(mockGetLeagueSeasons).toHaveBeenCalledWith(3);

    await waitFor(() => expect(result.current.courtId).toBe(12));
    act(() => result.current.confirmCourt());
    act(() => result.current.setIsRanked(false));
    expect(result.current.isRanked).toBe(true);

    await act(async () => { await result.current.onSubmit(); });
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({
      league_id: 3,
      season_id: 8,
      is_ranked: true,
    }));
  });

  it('locks ranked when a season is selected after the form opens', async () => {
    const { result } = renderHook(() => useSessionCreateScreen({ leagueId: 3 }), { wrapper });
    await waitFor(() => expect(result.current.leagueSeasons).toHaveLength(1));
    act(() => {
      result.current.setIsRanked(false);
      result.current.setSelectedSeasonId(8);
    });
    expect(result.current.isRanked).toBe(true);
    expect(result.current.isRankedLocked).toBe(true);
  });

  it('uses the saved metro private court when no home court exists', async () => {
    mockGetPlayerHomeCourts.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useSessionCreateScreen(), { wrapper });

    await waitFor(() => expect(result.current.courtId).toBe(90));
    expect(mockGetPlaceholderCourt).toHaveBeenCalledWith('montreal');
    expect(result.current.courtConfirmed).toBe(false);
  });

  it('replaces an untouched placeholder when a fresh home-court refetch arrives', async () => {
    let resolveHomeCourts!: (courts: Array<{ id: number; name: string; position: number }>) => void;
    mockGetPlayerHomeCourts.mockReturnValueOnce(new Promise((resolve) => {
      resolveHomeCourts = resolve;
    }));
    queryClient.setQueryData(playerKeys.homeCourts(7, 44), [], { updatedAt: 1 });
    const { result } = renderHook(() => useSessionCreateScreen(), { wrapper });

    await waitFor(() => expect(result.current.courtId).toBe(90));
    await act(async () => {
      resolveHomeCourts([{ id: 12, name: 'Fresh Home Beach', position: 0 }]);
    });

    await waitFor(() => expect(result.current.courtId).toBe(12));
    expect(result.current.courtName).toBe('Fresh Home Beach');
    expect(result.current.courtConfirmed).toBe(false);
  });

  it('blocks submission until the suggested court is explicitly confirmed', async () => {
    const { result } = renderHook(() => useSessionCreateScreen(), { wrapper });
    await waitFor(() => expect(result.current.courtId).toBe(12));

    await act(async () => { await result.current.onSubmit(); });
    expect(mockCreateSession).not.toHaveBeenCalled();
    expect(result.current.submitError).toContain('Confirm');

    act(() => result.current.confirmCourt());
    mockCreateSession.mockResolvedValue({ id: 99 });
    await act(async () => { await result.current.onSubmit(); });
    expect(mockCreateSession).toHaveBeenCalledWith(expect.objectContaining({ court_id: 12 }));
  });
});
