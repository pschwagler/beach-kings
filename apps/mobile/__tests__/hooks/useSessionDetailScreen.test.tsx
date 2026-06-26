/**
 * Tests for useSessionDetailScreen — data + actions hook for the Session Detail view.
 *
 * Mocks `@/lib/api` at module level. Each test wires a fresh useApi-compatible mock.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

const mockGetSessionById = jest.fn();
const mockLockInSession = jest.fn();
const mockGetCurrentUserPlayer = jest.fn();
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);
const mockHapticLight = jest.fn().mockResolvedValue(undefined);
const mockPush = jest.fn();
const mockBack = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    lockInSession: (...args: unknown[]) => mockLockInSession(...args),
    getCurrentUserPlayer: (...args: unknown[]) => mockGetCurrentUserPlayer(...args),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ push: mockPush, back: mockBack })),
  useFocusEffect: jest.fn(),
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: (...args: unknown[]) => mockHapticMedium(...args),
  hapticLight: (...args: unknown[]) => mockHapticLight(...args),
}));

import { useSessionDetailScreen } from '@/components/screens/Sessions/useSessionDetailScreen';
import type { SessionDetail } from '@beach-kings/shared';

const SESSION: SessionDetail = {
  id: 7,
  code: 'BK7TEST1',
  league_id: 1,
  league_name: 'Test League',
  court_name: 'Court 1',
  date: '2026-04-01',
  start_time: '6:00 PM',
  session_number: 1,
  status: 'active',
  session_type: 'pickup',
  max_players: 16,
  notes: null,
  is_ranked: true,
  players: [
    {
      entry_id: 1,
      player_id: 1,
      display_name: 'You',
      initials: 'YO',
      is_placeholder: false,
      game_count: 2,
    },
  ] as SessionDetail['players'],
  games: [],
  user_wins: 1,
  user_losses: 1,
  user_rating_change: 2.0,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionById.mockResolvedValue(SESSION);
  mockGetCurrentUserPlayer.mockResolvedValue({
    id: 1,
    name: 'Test User',
    full_name: 'Test User',
  });
});

describe('useSessionDetailScreen', () => {
  it('returns session detail from getSessionById on success', async () => {
    const { result } = renderHook(() => useSessionDetailScreen(7));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.session).toEqual(SESSION);
    expect(result.current.error).toBeNull();
    expect(mockGetSessionById).toHaveBeenCalledWith(7);
  });

  it('exposes currentPlayerName fetched via getCurrentUserPlayer', async () => {
    const { result } = renderHook(() => useSessionDetailScreen(7));

    await waitFor(() => expect(result.current.currentPlayerName).toBe('Test User'));
  });

  it('falls back to player.name when full_name is missing', async () => {
    mockGetCurrentUserPlayer.mockResolvedValue({ id: 1, name: 'Just Name' });

    const { result } = renderHook(() => useSessionDetailScreen(7));

    await waitFor(() =>
      expect(result.current.currentPlayerName).toBe('Just Name'),
    );
  });

  it('keeps currentPlayerName null when getCurrentUserPlayer fails', async () => {
    mockGetCurrentUserPlayer.mockRejectedValue(new Error('Auth required'));

    const { result } = renderHook(() => useSessionDetailScreen(7));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.currentPlayerName).toBeNull();
  });

  it('error state surfaces when getSessionById rejects', async () => {
    mockGetSessionById.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useSessionDetailScreen(7));

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.session).toBeNull();
  });

  it('onSubmitSession calls lockInSession and clears submitError on success', async () => {
    mockLockInSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onSubmitSession();
    });

    expect(mockLockInSession).toHaveBeenCalledWith(7);
    expect(result.current.submitError).toBeNull();
    expect(result.current.isSubmitting).toBe(false);
  });

  it('onSubmitSession surfaces error message in submitError when lockInSession throws', async () => {
    mockLockInSession.mockRejectedValue(new Error('Server unavailable'));
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onSubmitSession();
    });

    expect(result.current.submitError).toBe('Server unavailable');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('onSubmitSession uses fallback message when caught value is not Error', async () => {
    mockLockInSession.mockRejectedValue('plain string failure');
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onSubmitSession();
    });

    expect(result.current.submitError).toMatch(/Could not submit session/i);
  });

  it('onClearSubmitError resets submitError to null', async () => {
    mockLockInSession.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onSubmitSession();
    });
    expect(result.current.submitError).toBe('boom');

    act(() => {
      result.current.onClearSubmitError();
    });
    expect(result.current.submitError).toBeNull();
  });

  it('openMenu and closeMenu toggle isMenuOpen', async () => {
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isMenuOpen).toBe(false);
    act(() => {
      result.current.openMenu();
    });
    expect(result.current.isMenuOpen).toBe(true);

    act(() => {
      result.current.closeMenu();
    });
    expect(result.current.isMenuOpen).toBe(false);
  });

  it('onAddGame navigates to score-game with session context', async () => {
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onAddGame();
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/\(stack\)\/score-game\?/);
    expect(url).toContain('sessionId=7');
    expect(url).toContain('leagueId=1');
    // Empty games array → next game number is 1
    expect(url).toContain('gameNumber=1');
    // sessionLabel: SESSION.date is '2026-04-01' (Wednesday), court is 'Court 1'.
    // YYYY-MM-DD parses as local time, so the day name is stable across timezones.
    expect(url).toContain('sessionLabel=Wednesday%20at%20Court%201');
  });

  it('onAddGame omits gameNumber when session has not loaded', async () => {
    // Force getSessionById to never resolve in time
    mockGetSessionById.mockImplementation(() => new Promise(() => {}));
    const { result } = renderHook(() => useSessionDetailScreen(7));

    act(() => {
      result.current.onAddGame();
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toContain('sessionId=7');
    expect(url).not.toContain('gameNumber=');
    expect(url).not.toContain('sessionLabel=');
  });

  it('onRetry refetches the session', async () => {
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetSessionById).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.onRetry();
    });
    await waitFor(() => expect(mockGetSessionById).toHaveBeenCalledTimes(2));
  });

  it('onEditGame navigates to score-game with matchId, gameNumber, sessionLabel, and headerTitle', async () => {
    const { result } = renderHook(() => useSessionDetailScreen(7));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onEditGame({
        id: 555,
        game_number: 3,
        team1_player1_id: 10,
        team1_player2_id: 11,
        team2_player1_id: 12,
        team2_player2_id: 13,
        team1_player1_name: 'A',
        team1_player2_name: 'B',
        team2_player1_name: 'C',
        team2_player2_name: 'D',
        team1_score: 21,
        team2_score: 15,
        winner: 1,
        rating_change: null,
        is_ranked: true,
      });
    });

    expect(mockPush).toHaveBeenCalledTimes(1);
    const url = mockPush.mock.calls[0][0] as string;
    expect(url).toMatch(/^\/\(stack\)\/score-game\?/);
    expect(url).toContain('sessionId=7');
    expect(url).toContain('leagueId=1');
    expect(url).toContain('matchId=555');
    expect(url).toContain('gameNumber=3');
    expect(url).toContain('sessionLabel=Wednesday%20at%20Court%201');
    expect(url).toContain('headerTitle=Edit%20Game');
  });
});
