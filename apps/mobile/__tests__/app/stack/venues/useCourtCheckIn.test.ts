/**
 * Unit tests for the useCourtCheckIn hook.
 *
 * Covers:
 *   - Initial fetch: loads count + checked_in_players on mount
 *   - Already checked-in detection: isCheckedIn = true when currentPlayerId
 *     appears in checked_in_players
 *   - Not checked in: isCheckedIn = false when player is absent
 *   - Null player id: isCheckedIn = false, checkIn() no-ops gracefully
 *   - Successful check-in: calls api.checkInToCourt, refetches count
 *   - Error on checkIn: surfaces error, isSubmitting resets to false
 *   - Error on initial fetch: error is surfaced
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
  count: 0,
  checked_in_players: [],
};

const PLAYER_42_RESPONSE = {
  count: 3,
  checked_in_players: [
    {
      id: 10,
      player_id: 42,
      player_name: 'Patrick S.',
      avatar: null,
      checked_in_at: '2026-06-21T10:00:00Z',
      expires_at: '2026-06-21T14:00:00Z',
    },
    {
      id: 11,
      player_id: 99,
      player_name: 'Ken F.',
      avatar: null,
      checked_in_at: '2026-06-21T11:00:00Z',
      expires_at: '2026-06-21T15:00:00Z',
    },
    {
      id: 12,
      player_id: 7,
      player_name: 'Alex M.',
      avatar: null,
      checked_in_at: '2026-06-21T11:30:00Z',
      expires_at: '2026-06-21T15:30:00Z',
    },
  ],
};

const AFTER_CHECKIN_RESPONSE = {
  count: 1,
  checked_in_players: [
    {
      id: 20,
      player_id: 5,
      player_name: 'New Player',
      avatar: null,
      checked_in_at: '2026-06-21T12:00:00Z',
      expires_at: '2026-06-21T16:00:00Z',
    },
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

  it('exposes count from the fetch response', async () => {
    mockGetCourtCheckIns.mockResolvedValue(PLAYER_42_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.count).toBe(3);
    });
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

describe('useCourtCheckIn — isCheckedIn detection', () => {
  it('isCheckedIn is true when currentPlayerId is in checked_in_players', async () => {
    mockGetCourtCheckIns.mockResolvedValue(PLAYER_42_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isCheckedIn).toBe(true);
  });

  it('isCheckedIn is false when currentPlayerId is NOT in checked_in_players', async () => {
    mockGetCourtCheckIns.mockResolvedValue(PLAYER_42_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 100),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isCheckedIn).toBe(false);
  });

  it('isCheckedIn is false when list is empty', async () => {
    mockGetCourtCheckIns.mockResolvedValue(EMPTY_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 42),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isCheckedIn).toBe(false);
  });

  it('isCheckedIn is false when currentPlayerId is null', async () => {
    mockGetCourtCheckIns.mockResolvedValue(PLAYER_42_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, null),
    );
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.isCheckedIn).toBe(false);
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

  it('refetches count after successful check-in', async () => {
    mockGetCourtCheckIns
      .mockResolvedValueOnce(EMPTY_RESPONSE)
      .mockResolvedValue(AFTER_CHECKIN_RESPONSE);
    const { result } = renderHook(() =>
      useCourtCheckIn(MOCK_COURT, 5),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.count).toBe(0);

    await act(async () => {
      await result.current.checkIn();
    });

    await waitFor(() => {
      expect(result.current.count).toBe(1);
    });
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
});
