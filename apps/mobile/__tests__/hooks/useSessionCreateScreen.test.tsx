/**
 * Tests for useSessionCreateScreen — form state + create submission flow.
 */

import { renderHook, waitFor, act } from '@testing-library/react-native';

const mockCreateSession = jest.fn();
const mockReplace = jest.fn();
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/api', () => ({
  api: {
    createSession: (...args: unknown[]) => mockCreateSession(...args),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ replace: mockReplace })),
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: (...args: unknown[]) => mockHapticMedium(...args),
}));

import { useSessionCreateScreen } from '@/components/screens/Sessions/useSessionCreateScreen';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSessionCreateScreen', () => {
  it('initialises with sensible defaults', () => {
    const { result } = renderHook(() => useSessionCreateScreen());

    expect(result.current.sessionType).toBe('pickup');
    expect(result.current.maxPlayers).toBe(16);
    expect(result.current.startTime).toBe('');
    expect(result.current.notes).toBe('');
    expect(result.current.isRanked).toBe(true);
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.submitError).toBeNull();
    // date defaults to today (just verify ISO-ish format)
    expect(result.current.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('setters update form state', () => {
    const { result } = renderHook(() => useSessionCreateScreen());

    act(() => {
      result.current.setDate('2026-05-01');
      result.current.setStartTime('18:00');
      result.current.setCourtName('Sand');
      result.current.setSessionType('league');
      result.current.setMaxPlayers(8);
      result.current.setNotes('hello');
      result.current.setIsRanked(false);
    });

    expect(result.current.date).toBe('2026-05-01');
    expect(result.current.startTime).toBe('18:00');
    expect(result.current.courtName).toBe('Sand');
    expect(result.current.sessionType).toBe('league');
    expect(result.current.maxPlayers).toBe(8);
    expect(result.current.notes).toBe('hello');
    expect(result.current.isRanked).toBe(false);
  });

  it('onSubmit posts the form and replaces route on success', async () => {
    mockCreateSession.mockResolvedValue({ id: 99 });
    const { result } = renderHook(() => useSessionCreateScreen());

    act(() => {
      result.current.setStartTime('18:00');
      result.current.setCourtName('Court A');
      result.current.setNotes('hi');
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: '18:00',
        court_name: 'Court A',
        session_type: 'pickup',
        max_players: 16,
        notes: 'hi',
        is_ranked: true,
      }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(stack)/session/99');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.submitError).toBeNull();
  });

  it('onSubmit includes is_ranked: false when toggle is off', async () => {
    mockCreateSession.mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useSessionCreateScreen());

    act(() => {
      result.current.setIsRanked(false);
    });

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({ is_ranked: false }),
    );
  });

  it('onSubmit normalises empty strings to null in the payload', async () => {
    mockCreateSession.mockResolvedValue({ id: 1 });
    const { result } = renderHook(() => useSessionCreateScreen());

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        start_time: null,
        court_name: null,
        notes: null,
      }),
    );
  });

  it('onSubmit captures Error message in submitError', async () => {
    mockCreateSession.mockRejectedValue(new Error('Date is invalid'));
    const { result } = renderHook(() => useSessionCreateScreen());

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.submitError).toBe('Date is invalid');
    expect(result.current.isSubmitting).toBe(false);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('onSubmit uses fallback message for non-Error rejections', async () => {
    mockCreateSession.mockRejectedValue('weird value');
    const { result } = renderHook(() => useSessionCreateScreen());

    await act(async () => {
      await result.current.onSubmit();
    });

    expect(result.current.submitError).toBe('Failed to create session.');
  });
});
