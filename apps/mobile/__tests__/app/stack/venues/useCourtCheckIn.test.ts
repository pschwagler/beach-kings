/**
 * Unit tests for the useCourtCheckIn hook.
 *
 * Covers:
 *   - Initial fetch: loads total + breakdown on mount
 *   - isCheckedIn defaults to false on mount (no player-identity data in response)
 *   - Null player id: isCheckedIn = false, checkIn() no-ops gracefully
 *   - Successful check-in: calls api.checkInToCourt, sets isCheckedIn=true, refetches total
 *   - Error on checkIn: surfaces error, isSubmitting resets to false
 *   - Error on initial fetch: error is surfaced
 *   - breakdown is exposed and updated after refetch
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetCourtCheckIns = jest.fn();
const mockCheckInToCourt = jest.fn();
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/api', () => ({
  api: {
    getCourtCheckIns: (...args: unknown[]) => mockGetCourtCheckIns(...args),
    checkInToCourt: (...args: unknown[]) => mockCheckInToCourt(...args),
  },
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------

import { useCourtCheckIn } from '../../../../src/components/screens/Venues/useCourtCheckIn';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const MOCK_COURT = {
  id: 1,
  slug: 'manhattan-beach',
  name: 'Manhattan Beach Courts',
  surface_type: 'sand' as const,
  city: 'Manhattan Beach',
  state: 'CA',
  average_rating: 4.6,
  review_count: 42,
  is_active: true,
};

const EMPTY_RESPONSE = {
  total: 0,
  breakdown: [],
};

const POPULATED_RESPONSE = {
  total: 3,
  breakdown: [
    { level: 'Intermediate', gender: 'Women', count: 2 },
    { level: 'Advanced', gender: 'Men', count: 1 },
  ],
};

const AFTER_CHECKIN_RESPONSE = {
  total: 4,
  breakdown: [
    { level: 'Intermediate', gender: 'Women', count: 2 },
    { level: 'Advanced', gender: 'Men', count: 1 },
    { level: null, gender: null, count: 1 },
  ],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCourtCheckIns.mockResolvedValue(EMPTY_RESPONSE);
  mockCheckInToCourt.mockResolvedValue({
    id: 20,
    court_id: 1,
    checked_in_at: '2026-06-21T12:00:00Z',
    expires_at: '2026-06-21T16:00:00Z',
  });
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useCourtCheckIn — initial fetch', () => {
  it('starts with isLoading true before fetch resolves', () => {
    mockGetCourtCheckIns.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 1),
    );
    expect(result.current.isLoading).toBe(true);
  });

  it('fetches check-ins on mount using slug when available', async () => {
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGetCourtCheckIns).toHaveBeenCalledWith('manhattan-beach');
  });

  it('fetches check-ins using court.id when no slug', async () => {
    const courtNoSlug = { ...MOCK_COURT, slug: undefined as unknown as string };
    const { result } = renderHook(() =>
      useCourtCheckIn(courtNoSlug, null),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(mockGetCourtCheckIns).toHaveBeenCalledWith(1);
  });

  it('exposes total from the fetch response', async () => {
    mockGetCourtCheckIns.mockResolvedValue(POPULATED_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.total).toBe(3);
    });
  });

  it('exposes breakdown from the fetch response', async () => {
    mockGetCourtCheckIns.mockResolvedValue(POPULATED_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.breakdown).toHaveLength(2);
    });
    expect(result.current.breakdown[0].level).toBe('Intermediate');
    expect(result.current.breakdown[0].gender).toBe('Women');
    expect(result.current.breakdown[0].count).toBe(2);
  });

  it('exposes empty breakdown when no one is checked in', async () => {
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.breakdown).toEqual([]);
    expect(result.current.total).toBe(0);
  });

  it('surfaces fetch error', async () => {
    mockGetCourtCheckIns.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
    expect(result.current.error?.message).toBe('network');
  });
});

describe('useCourtCheckIn — isCheckedIn local state', () => {
  it('isCheckedIn is false on mount regardless of response', async () => {
    mockGetCourtCheckIns.mockResolvedValue(POPULATED_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isCheckedIn).toBe(false);
  });

  it('isCheckedIn is false when currentPlayerId is null', async () => {
    mockGetCourtCheckIns.mockResolvedValue(POPULATED_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isCheckedIn).toBe(false);
  });

  it('isCheckedIn flips to true after successful checkIn()', async () => {
    mockGetCourtCheckIns
      .mockResolvedValueOnce(EMPTY_RESPONSE)
      .mockResolvedValue(AFTER_CHECKIN_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.checkIn();
    });

    expect(result.current.isCheckedIn).toBe(true);
  });
});

describe('useCourtCheckIn — checkIn action', () => {
  it('calls checkInToCourt with court.id on success', async () => {
    mockGetCourtCheckIns
      .mockResolvedValueOnce(EMPTY_RESPONSE)
      .mockResolvedValue(AFTER_CHECKIN_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.checkIn();
    });

    expect(mockCheckInToCourt).toHaveBeenCalledWith(1);
  });

  it('triggers haptic feedback on check-in', async () => {
    mockGetCourtCheckIns
      .mockResolvedValueOnce(EMPTY_RESPONSE)
      .mockResolvedValue(AFTER_CHECKIN_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.checkIn();
    });

    expect(mockHapticMedium).toHaveBeenCalled();
  });

  it('refetches total and breakdown after successful check-in', async () => {
    mockGetCourtCheckIns
      .mockResolvedValueOnce(EMPTY_RESPONSE)
      .mockResolvedValue(AFTER_CHECKIN_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.total).toBe(0);

    await act(async () => {
      await result.current.checkIn();
    });

    await waitFor(() => {
      expect(result.current.total).toBe(4);
    });
    expect(result.current.breakdown).toHaveLength(3);
    // getCourtCheckIns called twice: once on mount, once after check-in
    expect(mockGetCourtCheckIns).toHaveBeenCalledTimes(2);
  });

  it('sets isSubmitting=true during check-in and resets on success', async () => {
    let resolveCheckIn!: () => void;
    mockCheckInToCourt.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveCheckIn = resolve;
      }),
    );
    mockGetCourtCheckIns.mockResolvedValue(EMPTY_RESPONSE);

    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      void result.current.checkIn();
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    await act(async () => {
      resolveCheckIn();
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(false));
  });

  it('surfaces error and resets isSubmitting when checkInToCourt throws', async () => {
    mockGetCourtCheckIns.mockResolvedValue(EMPTY_RESPONSE);
    mockCheckInToCourt.mockRejectedValue(new Error('server error'));

    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.checkIn();
    });

    expect(result.current.error?.message).toBe('server error');
    expect(result.current.isSubmitting).toBe(false);
  });

  it('does not call checkInToCourt when currentPlayerId is null', async () => {
    mockGetCourtCheckIns.mockResolvedValue(EMPTY_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.checkIn();
    });

    expect(mockCheckInToCourt).not.toHaveBeenCalled();
  });

  it('does not flip isCheckedIn when checkInToCourt throws', async () => {
    mockGetCourtCheckIns.mockResolvedValue(EMPTY_RESPONSE);
    mockCheckInToCourt.mockRejectedValue(new Error('server error'));

    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.checkIn();
    });

    expect(result.current.isCheckedIn).toBe(false);
  });
});
