import { act, renderHook, waitFor } from '@testing-library/react-native';

const mockCreateSession = jest.fn();
const mockGetLeague = jest.fn();
const mockGetLeagueSeasons = jest.fn();
const mockReplace = jest.fn();
const mockInvalidateQueries = jest.fn().mockResolvedValue(undefined);

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: mockInvalidateQueries }),
}));
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 }, isAuthenticated: true }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
    getLeague: (...args: unknown[]) => mockGetLeague(...args),
    getLeagueSeasons: (...args: unknown[]) => mockGetLeagueSeasons(...args),
  },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ replace: mockReplace }) }));
jest.mock('@/utils/haptics', () => ({ hapticMedium: jest.fn().mockResolvedValue(undefined) }));

import { useSessionCreateScreen } from '@/components/screens/Sessions/useSessionCreateScreen';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLeague.mockResolvedValue({ id: 3, name: 'QBK Open Men' });
  mockGetLeagueSeasons.mockResolvedValue([{ id: 8, name: 'Spring 2026', is_active: true }]);
});

describe('useSessionCreateScreen', () => {
  it('initializes a pickup session with a selected-court ID state', () => {
    const { result } = renderHook(() => useSessionCreateScreen());

    expect(result.current.courtId).toBeNull();
    expect(result.current.selectedSeasonId).toBeNull();
    expect(result.current.isRanked).toBe(true);
    expect(result.current.isRankedLocked).toBe(false);
  });

  it('updates date, start time, court ID, and ranked state', () => {
    const { result } = renderHook(() => useSessionCreateScreen());
    act(() => {
      result.current.setDate('2026-05-01');
      result.current.setStartTime('18:00');
      result.current.setCourtId(42);
      result.current.setIsRanked(false);
    });

    expect(result.current.date).toBe('2026-05-01');
    expect(result.current.startTime).toBe('18:00');
    expect(result.current.courtId).toBe(42);
    expect(result.current.isRanked).toBe(false);
  });

  it('submits court_id and omits legacy writable fields', async () => {
    mockCreateSession.mockResolvedValue({ id: 99 });
    const { result } = renderHook(() => useSessionCreateScreen());
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
    const { result } = renderHook(() => useSessionCreateScreen({ leagueId: 3, seasonId: 8 }));

    await waitFor(() => expect(result.current.leagueName).toBe('QBK Open Men'));
    await waitFor(() => expect(result.current.leagueSeasons).toHaveLength(1));
    expect(result.current.selectedSeasonId).toBe(8);
    expect(result.current.isRankedLocked).toBe(true);
    expect(mockGetLeagueSeasons).toHaveBeenCalledWith(3);

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
    const { result } = renderHook(() => useSessionCreateScreen({ leagueId: 3 }));
    await waitFor(() => expect(result.current.leagueSeasons).toHaveLength(1));
    act(() => {
      result.current.setIsRanked(false);
      result.current.setSelectedSeasonId(8);
    });
    expect(result.current.isRanked).toBe(true);
    expect(result.current.isRankedLocked).toBe(true);
  });
});
