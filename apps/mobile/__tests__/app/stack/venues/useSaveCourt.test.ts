/**
 * Unit tests for the useSaveCourt hook.
 *
 * Covers:
 *   - Initialises isSaved from court.is_saved
 *   - Defaults isSaved to false when court.is_saved is null / undefined
 *   - Re-syncs isSaved when court.is_saved prop changes
 *   - toggle() no-ops when currentPlayerId is null
 *   - toggle() calls api.saveCourt when currently unsaved (optimistic flip)
 *   - toggle() calls api.unsaveCourt when currently saved (optimistic flip)
 *   - toggle() triggers haptic feedback
 *   - toggle() reverts optimistic state on api error
 *   - isSubmitting is true during toggle and resets after
 *   - Sets error on api failure, resets on next successful toggle
 */

import { renderHook, act, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSaveCourt = jest.fn();
const mockUnsaveCourt = jest.fn();
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/api', () => ({
  api: {
    saveCourt: (...args: unknown[]) => mockSaveCourt(...args),
    unsaveCourt: (...args: unknown[]) => mockUnsaveCourt(...args),
  },
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: () => mockHapticMedium(),
}));

// ---------------------------------------------------------------------------
// Module under test — imported AFTER mocks
// ---------------------------------------------------------------------------

import { useSaveCourt } from '../../../../src/components/screens/Venues/useSaveCourt';

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
  is_saved: false,
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveCourt.mockResolvedValue({ court_id: 1, saved: true });
  mockUnsaveCourt.mockResolvedValue({ court_id: 1, saved: false });
});

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

describe('useSaveCourt — initial state', () => {
  it('initialises isSaved as false when court.is_saved is false', () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 1),
    );
    expect(result.current.isSaved).toBe(false);
  });

  it('initialises isSaved as true when court.is_saved is true', () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: true }, 1),
    );
    expect(result.current.isSaved).toBe(true);
  });

  it('initialises isSaved as false when court.is_saved is null', () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: null }, 1),
    );
    expect(result.current.isSaved).toBe(false);
  });

  it('initialises isSaved as false when court.is_saved is undefined', () => {
    const { result } = renderHook(() => {
      const { is_saved: _omit, ...courtWithoutSaved } = MOCK_COURT;
      return useSaveCourt(courtWithoutSaved, 1);
    });
    expect(result.current.isSaved).toBe(false);
  });

  it('starts with isSubmitting false', () => {
    const { result } = renderHook(() => useSaveCourt(MOCK_COURT, 1));
    expect(result.current.isSubmitting).toBe(false);
  });

  it('starts with error null', () => {
    const { result } = renderHook(() => useSaveCourt(MOCK_COURT, 1));
    expect(result.current.error).toBeNull();
  });

  it('does NOT fetch on mount (no api calls)', () => {
    renderHook(() => useSaveCourt(MOCK_COURT, 1));
    expect(mockSaveCourt).not.toHaveBeenCalled();
    expect(mockUnsaveCourt).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Re-sync when court.is_saved prop changes
// ---------------------------------------------------------------------------

describe('useSaveCourt — re-sync on prop change', () => {
  it('re-syncs isSaved when court.is_saved changes from false to true', async () => {
    const { result, rerender } = renderHook(
      ({ saved }: { saved: boolean }) =>
        useSaveCourt({ ...MOCK_COURT, is_saved: saved }, 1),
      { initialProps: { saved: false } },
    );
    expect(result.current.isSaved).toBe(false);

    rerender({ saved: true });

    await waitFor(() => {
      expect(result.current.isSaved).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// toggle() — no-op when unauthenticated
// ---------------------------------------------------------------------------

describe('useSaveCourt — toggle no-op when unauthenticated', () => {
  it('does not call saveCourt when currentPlayerId is null', async () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, null),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockSaveCourt).not.toHaveBeenCalled();
  });

  it('does not change isSaved when currentPlayerId is null', async () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, null),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isSaved).toBe(false);
  });

  it('does not fire haptic when currentPlayerId is null', async () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, null),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockHapticMedium).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toggle() — save (unsaved → saved)
// ---------------------------------------------------------------------------

describe('useSaveCourt — toggle to save', () => {
  it('calls api.saveCourt with court.id when currently unsaved', async () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockSaveCourt).toHaveBeenCalledWith(1);
    expect(mockUnsaveCourt).not.toHaveBeenCalled();
  });

  it('optimistically flips isSaved to true before api resolves', async () => {
    let resolveApi!: (v: { court_id: number; saved: boolean }) => void;
    mockSaveCourt.mockReturnValue(
      new Promise<{ court_id: number; saved: boolean }>((r) => {
        resolveApi = r;
      }),
    );

    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );

    act(() => {
      void result.current.toggle();
    });

    await waitFor(() => expect(result.current.isSaved).toBe(true));

    await act(async () => {
      resolveApi({ court_id: 1, saved: true });
    });
  });

  it('fires haptic feedback when toggling to saved', async () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockHapticMedium).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// toggle() — unsave (saved → unsaved)
// ---------------------------------------------------------------------------

describe('useSaveCourt — toggle to unsave', () => {
  it('calls api.unsaveCourt with court.id when currently saved', async () => {
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: true }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(mockUnsaveCourt).toHaveBeenCalledWith(1);
    expect(mockSaveCourt).not.toHaveBeenCalled();
  });

  it('optimistically flips isSaved to false before api resolves', async () => {
    let resolveApi!: (v: { court_id: number; saved: boolean }) => void;
    mockUnsaveCourt.mockReturnValue(
      new Promise<{ court_id: number; saved: boolean }>((r) => {
        resolveApi = r;
      }),
    );

    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: true }, 42),
    );

    act(() => {
      void result.current.toggle();
    });

    await waitFor(() => expect(result.current.isSaved).toBe(false));

    await act(async () => {
      resolveApi({ court_id: 1, saved: false });
    });
  });
});

// ---------------------------------------------------------------------------
// toggle() — error handling + revert
// ---------------------------------------------------------------------------

describe('useSaveCourt — error handling', () => {
  it('reverts isSaved to original when api.saveCourt throws', async () => {
    mockSaveCourt.mockRejectedValue(new Error('server error'));
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isSaved).toBe(false);
  });

  it('reverts isSaved to original when api.unsaveCourt throws', async () => {
    mockUnsaveCourt.mockRejectedValue(new Error('server error'));
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: true }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isSaved).toBe(true);
  });

  it('surfaces error when api throws', async () => {
    mockSaveCourt.mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.error?.message).toBe('save failed');
  });

  it('clears error on next successful toggle', async () => {
    mockSaveCourt.mockRejectedValueOnce(new Error('transient error'));
    mockSaveCourt.mockResolvedValue({ court_id: 1, saved: true });

    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );

    // First toggle — fails
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.error).not.toBeNull();

    // Second toggle — succeeds
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.error).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toggle() — isSubmitting lifecycle
// ---------------------------------------------------------------------------

describe('useSaveCourt — isSubmitting lifecycle', () => {
  it('sets isSubmitting=true during toggle and resets to false on success', async () => {
    let resolveApi!: (v: { court_id: number; saved: boolean }) => void;
    mockSaveCourt.mockReturnValue(
      new Promise<{ court_id: number; saved: boolean }>((r) => {
        resolveApi = r;
      }),
    );

    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );

    act(() => {
      void result.current.toggle();
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(true));

    await act(async () => {
      resolveApi({ court_id: 1, saved: true });
    });
    await waitFor(() => expect(result.current.isSubmitting).toBe(false));
  });

  it('resets isSubmitting to false on api error', async () => {
    mockSaveCourt.mockRejectedValue(new Error('err'));
    const { result } = renderHook(() =>
      useSaveCourt({ ...MOCK_COURT, is_saved: false }, 42),
    );
    await act(async () => {
      await result.current.toggle();
    });
    expect(result.current.isSubmitting).toBe(false);
  });
});
