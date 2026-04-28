/**
 * Tests for useSessionEditScreen — pre-populates form from session detail
 * and saves edits via api.updateSession.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';

const mockGetSessionById = jest.fn();
const mockUpdateSession = jest.fn();
const mockBack = jest.fn();
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    updateSession: (...args: unknown[]) => mockUpdateSession(...args),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: mockBack })),
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: (...args: unknown[]) => mockHapticMedium(...args),
}));

import { useSessionEditScreen } from '@/components/screens/Sessions/useSessionEditScreen';
import type { SessionDetail } from '@beach-kings/shared';

const SESSION: SessionDetail = {
  id: 5,
  league_id: null,
  league_name: null,
  court_name: 'Court B',
  date: '2026-04-10',
  start_time: '17:00',
  session_number: 1,
  status: 'active',
  session_type: 'league',
  max_players: 12,
  notes: 'first',
  players: [],
  games: [],
  user_wins: 0,
  user_losses: 0,
  user_rating_change: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSessionById.mockResolvedValue(SESSION);
});

describe('useSessionEditScreen', () => {
  it('pre-fills form fields from the loaded session', async () => {
    const { result } = renderHook(() => useSessionEditScreen(5));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));
    expect(result.current.startTime).toBe('17:00');
    expect(result.current.courtName).toBe('Court B');
    expect(result.current.sessionType).toBe('league');
    expect(result.current.notes).toBe('first');
  });

  it('coerces null session fields to empty strings', async () => {
    mockGetSessionById.mockResolvedValue({
      ...SESSION,
      start_time: null,
      court_name: null,
      notes: null,
    });

    const { result } = renderHook(() => useSessionEditScreen(5));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));
    expect(result.current.startTime).toBe('');
    expect(result.current.courtName).toBe('');
    expect(result.current.notes).toBe('');
  });

  it('onSave posts updates and goes back on success', async () => {
    mockUpdateSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));

    act(() => {
      result.current.setNotes('updated');
    });

    await act(async () => {
      await result.current.onSave();
    });

    expect(mockUpdateSession).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        date: '2026-04-10',
        start_time: '17:00',
        court_name: 'Court B',
        session_type: 'league',
        notes: 'updated',
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(result.current.submitError).toBeNull();
  });

  it('onSave normalises empty strings to null in the payload', async () => {
    mockUpdateSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));

    act(() => {
      result.current.setStartTime('');
      result.current.setCourtName('');
      result.current.setNotes('');
    });

    await act(async () => {
      await result.current.onSave();
    });

    expect(mockUpdateSession).toHaveBeenCalledWith(
      5,
      expect.objectContaining({
        start_time: null,
        court_name: null,
        notes: null,
      }),
    );
  });

  it('onSave captures Error message in submitError', async () => {
    mockUpdateSession.mockRejectedValue(new Error('forbidden'));
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));

    await act(async () => {
      await result.current.onSave();
    });

    expect(result.current.submitError).toBe('forbidden');
    expect(result.current.isSubmitting).toBe(false);
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('onSave uses fallback message when caught value is not Error', async () => {
    mockUpdateSession.mockRejectedValue(123);
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.date).toBe('2026-04-10'));

    await act(async () => {
      await result.current.onSave();
    });

    expect(result.current.submitError).toBe('Failed to save changes.');
  });

  it('onCancel calls router.back', async () => {
    const { result } = renderHook(() => useSessionEditScreen(5));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onCancel();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
