import { renderHook, act } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('../../components/league/utils/matchUtils', () => ({
  calculateWinner: vi.fn((s1: number, s2: number) => (s1 > s2 ? 'Team 1' : 'Team 2')),
}));

import { useEditBuffer, mergeBufferWithMatches } from '../useEditBuffer';

describe('useEditBuffer', () => {
  describe('initial state', () => {
    it('starts with empty buffer and isDirty: false', () => {
      const { result } = renderHook(() => useEditBuffer());

      expect(result.current.isDirty).toBe(false);
      expect(result.current.buffer.modified.size).toBe(0);
      expect(result.current.buffer.added).toHaveLength(0);
      expect(result.current.buffer.deleted.size).toBe(0);
    });
  });

  describe('isDirty', () => {
    it('is true after bufferAdd', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 21, team2_score: 15 });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('is true after bufferEdit on a real match', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferEdit(101, { team1_score: 18, team2_score: 10 });
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('is true after bufferDelete of a real match', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferDelete(55);
      });

      expect(result.current.isDirty).toBe(true);
    });

    it('returns to false after clearBuffer', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 21, team2_score: 0 });
        result.current.bufferEdit(5, { team1_score: 10, team2_score: 8 });
        result.current.bufferDelete(99);
      });

      expect(result.current.isDirty).toBe(true);

      act(() => {
        result.current.clearBuffer();
      });

      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('bufferAdd', () => {
    it('appends payload to added array', () => {
      const { result } = renderHook(() => useEditBuffer());

      const payload = { team1_player1_id: 1, team2_player1_id: 2, team1_score: 21, team2_score: 10 };
      act(() => {
        result.current.bufferAdd(payload);
      });

      expect(result.current.buffer.added).toHaveLength(1);
      expect(result.current.buffer.added[0]).toEqual(payload);
    });

    it('appends multiple entries independently', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 21, team2_score: 0 });
        result.current.bufferAdd({ team1_score: 15, team2_score: 10 });
      });

      expect(result.current.buffer.added).toHaveLength(2);
    });
  });

  describe('bufferEdit', () => {
    it('stores payload in modified map for real match ID', () => {
      const { result } = renderHook(() => useEditBuffer());

      const payload = { team1_score: 18, team2_score: 12 };
      act(() => {
        result.current.bufferEdit(42, payload);
      });

      expect(result.current.buffer.modified.get(42)).toEqual(payload);
    });

    it('overwrites previous edit for the same real match ID', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferEdit(42, { team1_score: 18 });
        result.current.bufferEdit(42, { team1_score: 21 });
      });

      expect(result.current.buffer.modified.get(42)).toEqual({ team1_score: 21 });
    });

    it('updates added array entry when pending ID is provided', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 10, team2_score: 5 });
      });

      act(() => {
        result.current.bufferEdit('pending-0', { team1_score: 21, team2_score: 15 });
      });

      expect(result.current.buffer.added[0]).toEqual({ team1_score: 21, team2_score: 15 });
      // modified map should NOT be touched for pending IDs
      expect(result.current.buffer.modified.size).toBe(0);
    });

    it('does not mutate added array when pending index is out of range', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 10 });
      });

      const before = result.current.buffer.added;
      act(() => {
        result.current.bufferEdit('pending-99', { team1_score: 21 });
      });

      expect(result.current.buffer.added).toBe(before);
    });
  });

  describe('bufferDelete', () => {
    it('adds real match ID to deleted set', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferDelete(77);
      });

      expect(result.current.buffer.deleted.has(77)).toBe(true);
    });

    it('removes match from modified map when deleting an edited real match', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferEdit(77, { team1_score: 21 });
        result.current.bufferDelete(77);
      });

      expect(result.current.buffer.modified.has(77)).toBe(false);
      expect(result.current.buffer.deleted.has(77)).toBe(true);
    });

    it('removes pending entry from added array when using pending ID', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 21 });
        result.current.bufferAdd({ team1_score: 15 });
      });

      act(() => {
        result.current.bufferDelete('pending-0');
      });

      expect(result.current.buffer.added).toHaveLength(1);
      // The second-added entry remains
      expect(result.current.buffer.added[0]).toEqual({ team1_score: 15 });
    });

    it('does not modify deleted set when deleting a pending match', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 21 });
        result.current.bufferDelete('pending-0');
      });

      expect(result.current.buffer.deleted.size).toBe(0);
    });
  });

  describe('clearBuffer', () => {
    it('resets all buffer state to initial values', () => {
      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferAdd({ team1_score: 21 });
        result.current.bufferEdit(5, { team1_score: 10 });
        result.current.bufferDelete(99);
      });

      act(() => {
        result.current.clearBuffer();
      });

      expect(result.current.buffer.modified.size).toBe(0);
      expect(result.current.buffer.added).toHaveLength(0);
      expect(result.current.buffer.deleted.size).toBe(0);
      expect(result.current.isDirty).toBe(false);
    });
  });

  describe('flush', () => {
    it('calls delete, update, create, and lockIn in correct order', async () => {
      const callOrder = [];
      const deleteMatchAPI = vi.fn(async () => callOrder.push('delete'));
      const updateMatchAPI = vi.fn(async () => callOrder.push('update'));
      const createMatchAPI = vi.fn(async () => callOrder.push('create'));
      const lockInSessionAPI = vi.fn(async () => callOrder.push('lockIn'));

      const { result } = renderHook(() => useEditBuffer());

      act(() => {
        result.current.bufferDelete(10);
        result.current.bufferEdit(20, { team1_score: 15 });
        result.current.bufferAdd({ team1_score: 21 });
      });

      await act(async () => {
        await result.current.flush(99, {
          deleteMatchAPI,
          updateMatchAPI,
          createMatchAPI,
          lockInSessionAPI,
        });
      });

      expect(deleteMatchAPI).toHaveBeenCalledWith(10);
      expect(updateMatchAPI).toHaveBeenCalledWith(20, { team1_score: 15 });
      expect(createMatchAPI).toHaveBeenCalledWith({ team1_score: 21, session_id: 99 });
      expect(lockInSessionAPI).toHaveBeenCalledWith(99);
      expect(callOrder).toEqual(['delete', 'update', 'create', 'lockIn']);
    });
  });
});

describe('mergeBufferWithMatches', () => {
  const baseMatches = [
    {
      id: 1,
      team_1_player_1: 'Alice',
      team_1_player_2: 'Bob',
      team_2_player_1: 'Carol',
      team_2_player_2: 'Dave',
      team_1_score: 21,
      team_2_score: 15,
      winner: 'Team 1',
    },
    {
      id: 2,
      team_1_player_1: 'Eve',
      team_1_player_2: 'Frank',
      team_2_player_1: 'Grace',
      team_2_player_2: 'Hank',
      team_1_score: 10,
      team_2_score: 21,
      winner: 'Team 2',
    },
  ];

  const emptyBuffer = { modified: new Map(), added: [], deleted: new Set() };
  const participantLookup = new Map([
    [1, 'Alice'], [2, 'Bob'], [3, 'Carol'], [4, 'Dave'],
    [5, 'Eve'], [6, 'Frank'], [7, 'Grace'], [8, 'Hank'],
    [99, 'NewPlayer'],
  ]);

  it('returns original array reference when buffer is empty', () => {
    const result = mergeBufferWithMatches(baseMatches, emptyBuffer, participantLookup);
    expect(result).toBe(baseMatches);
  });

  it('filters out matches with IDs in deleted set', () => {
    const buffer = { ...emptyBuffer, deleted: new Set([1]) };
    const result = mergeBufferWithMatches(baseMatches, buffer, participantLookup);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  it('overlays modified fields on existing matches', () => {
    const buffer = {
      ...emptyBuffer,
      modified: new Map([[1, { team1_score: 18, team2_score: 12 }]]),
    };
    const result = mergeBufferWithMatches(baseMatches, buffer, participantLookup);

    expect(result[0].team_1_score).toBe(18);
    expect(result[0].team_2_score).toBe(12);
  });

  it('resolves player ID to name in modified match via participantLookup', () => {
    const buffer = {
      ...emptyBuffer,
      modified: new Map([[1, { team1_player1_id: 99, team1_score: 21, team2_score: 10 }]]),
    };
    const result = mergeBufferWithMatches(baseMatches, buffer, participantLookup);

    expect(result[0].team_1_player_1).toBe('NewPlayer');
  });

  it('appends added entries with pending- IDs', () => {
    const buffer = {
      ...emptyBuffer,
      added: [
        {
          team1_player1_id: 1, team1_player2_id: 2,
          team2_player1_id: 3, team2_player2_id: 4,
          team1_score: 21, team2_score: 15,
        },
      ],
    };
    const result = mergeBufferWithMatches(baseMatches, buffer, participantLookup);

    expect(result).toHaveLength(3);
    expect(result[2].id).toBe('pending-0');
    expect(result[2].team_1_player_1).toBe('Alice');
    expect(result[2].team_1_score).toBe(21);
  });
});
