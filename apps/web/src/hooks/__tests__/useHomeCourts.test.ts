import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockShowToast = vi.fn();

vi.mock('../../contexts/ToastContext', () => ({
  useToast: vi.fn(() => ({ showToast: mockShowToast })),
}));

import useHomeCourts from '../useHomeCourts';

const COURTS = [
  { id: 'c1', name: 'Mission Beach', address: '123 Ocean Front Walk' },
  { id: 'c2', name: 'Pacific Beach', address: '456 Garnet Ave' },
  { id: 'c3', name: 'Coronado', address: '789 Ocean Blvd' },
];

describe('useHomeCourts', () => {
  let mockGet;
  let mockSet;
  let api;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn();
    mockSet = vi.fn().mockResolvedValue(undefined);
    api = { get: mockGet, set: mockSet };
  });

  describe('initialization', () => {
    it('initializes homeCourts from initialCourts prop', () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      expect(result.current.homeCourts).toEqual(COURTS);
    });

    it('initializes to empty array when initialCourts is not provided', () => {
      mockGet.mockResolvedValue([]);

      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', api })
      );

      expect(result.current.homeCourts).toEqual([]);
    });
  });

  describe('mount fetch', () => {
    it('calls api.get on mount when no initialCourts are provided', async () => {
      const fetched = [COURTS[0]];
      mockGet.mockResolvedValue(fetched);

      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', api })
      );

      await act(async () => {});

      expect(mockGet).toHaveBeenCalledWith('league-1');
      expect(result.current.homeCourts).toEqual(fetched);
    });

    it('does not call api.get on mount when initialCourts are provided', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {});

      expect(mockGet).not.toHaveBeenCalled();
      expect(result.current.homeCourts).toEqual(COURTS);
    });

    it('falls back to empty array when api.get resolves with null', async () => {
      mockGet.mockResolvedValue(null);

      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', api })
      );

      await act(async () => {});

      expect(result.current.homeCourts).toEqual([]);
    });
  });

  describe('handleSet', () => {
    it('applies an optimistic update by adding a position to each court', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      const newOrder = [COURTS[2], COURTS[0]];

      await act(async () => {
        await result.current.handleSet(newOrder);
      });

      expect(result.current.homeCourts).toEqual([
        { ...COURTS[2], position: 0 },
        { ...COURTS[0], position: 1 },
      ]);
    });

    it('calls api.set with the ordered array of court IDs', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      const newOrder = [COURTS[1], COURTS[0], COURTS[2]];

      await act(async () => {
        await result.current.handleSet(newOrder);
      });

      expect(mockSet).toHaveBeenCalledWith('league-1', ['c2', 'c1', 'c3']);
    });

    describe('error handling', () => {
      it('shows a toast with the API error detail on failure', async () => {
        const apiError = new Error('Request failed');
        apiError.response = { data: { detail: 'Too many courts' } };
        mockSet.mockRejectedValue(apiError);
        mockGet.mockResolvedValue(COURTS);

        const { result } = renderHook(() =>
          useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
        );

        await act(async () => {
          await result.current.handleSet([COURTS[0]]);
        });

        expect(mockShowToast).toHaveBeenCalledWith('Too many courts', 'error');
      });

      it('shows a generic toast message when error has no response.data.detail', async () => {
        mockSet.mockRejectedValue(new Error('Network error'));
        mockGet.mockResolvedValue(COURTS);

        const { result } = renderHook(() =>
          useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
        );

        await act(async () => {
          await result.current.handleSet([COURTS[0]]);
        });

        expect(mockShowToast).toHaveBeenCalledWith('Failed to update home courts', 'error');
      });

      it('rolls back via api.get refetch when api.get is available', async () => {
        mockSet.mockRejectedValue(new Error('fail'));
        const serverCourts = [COURTS[0], COURTS[1]];
        mockGet.mockResolvedValue(serverCourts);

        const { result } = renderHook(() =>
          useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
        );

        await act(async () => {
          await result.current.handleSet([COURTS[2]]);
        });

        expect(mockGet).toHaveBeenCalledWith('league-1');
        expect(result.current.homeCourts).toEqual(serverCourts);
      });

      it('rolls back to initialCourts when api.get is not provided', async () => {
        const apiNoGet = { set: mockSet };
        mockSet.mockRejectedValue(new Error('fail'));

        const { result } = renderHook(() =>
          useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api: apiNoGet })
        );

        await act(async () => {
          await result.current.handleSet([COURTS[0]]);
        });

        expect(result.current.homeCourts).toEqual(COURTS);
      });

      it('rolls back to previous state when no api.get and no initialCourts', async () => {
        const apiNoGet = { set: mockSet };
        mockSet.mockRejectedValue(new Error('fail'));

        const initialState = [COURTS[0], COURTS[1]];

        const { result } = renderHook(() =>
          useHomeCourts({ entityId: 'league-1', api: apiNoGet })
        );

        // Manually place courts into state via a successful handleSet first
        const mockSetSuccess = vi.fn().mockResolvedValue(undefined);
        apiNoGet.set = mockSetSuccess;

        await act(async () => {
          await result.current.handleSet(initialState);
        });

        // Now switch back to a failing set
        apiNoGet.set = mockSet;

        const stateBeforeFailure = result.current.homeCourts;

        await act(async () => {
          await result.current.handleSet([COURTS[2]]);
        });

        expect(result.current.homeCourts).toEqual(stateBeforeFailure);
      });
    });
  });

  describe('handleRemove', () => {
    it('filters out the specified court and calls api.set', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {
        await result.current.handleRemove('c2');
      });

      // homeCourts should not include c2
      const ids = result.current.homeCourts.map((c) => c.id);
      expect(ids).not.toContain('c2');
      expect(ids).toContain('c1');
      expect(ids).toContain('c3');
    });

    it('calls api.set with court IDs excluding the removed court', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {
        await result.current.handleRemove('c1');
      });

      expect(mockSet).toHaveBeenCalledWith('league-1', ['c2', 'c3']);
    });
  });

  describe('handleSetPrimary', () => {
    it('moves the selected court to index 0', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {
        await result.current.handleSetPrimary('c3');
      });

      expect(result.current.homeCourts[0].id).toBe('c3');
    });

    it('calls api.set with c3 first when promoting c3 to primary', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {
        await result.current.handleSetPrimary('c3');
      });

      expect(mockSet).toHaveBeenCalledWith('league-1', ['c3', 'c1', 'c2']);
    });

    it('does not call api.set when the court is already primary', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {
        await result.current.handleSetPrimary('c1'); // c1 is already index 0
      });

      expect(mockSet).not.toHaveBeenCalled();
    });

    it('does not call api.set for an unknown court id', async () => {
      const { result } = renderHook(() =>
        useHomeCourts({ entityId: 'league-1', initialCourts: COURTS, api })
      );

      await act(async () => {
        await result.current.handleSetPrimary('unknown');
      });

      expect(mockSet).not.toHaveBeenCalled();
    });
  });

  describe('prop sync', () => {
    it('updates homeCourts when initialCourts prop changes', async () => {
      const { result, rerender } = renderHook(
        ({ initialCourts }) =>
          useHomeCourts({ entityId: 'league-1', initialCourts, api }),
        { initialProps: { initialCourts: [COURTS[0]] } }
      );

      expect(result.current.homeCourts).toEqual([COURTS[0]]);

      const updatedCourts = [COURTS[1], COURTS[2]];

      act(() => {
        rerender({ initialCourts: updatedCourts });
      });

      expect(result.current.homeCourts).toEqual(updatedCourts);
    });
  });
});
