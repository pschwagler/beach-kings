/**
 * Tests for ScoreBoard drag-and-drop functionality.
 *
 * Covers:
 *   - swapSlots: cross-team swap, same-team swap, same-slot no-op
 *   - useScoreBoardDrag: dragFrom/dragTarget state, onSwap callback on drop
 *   - Ghost chip visibility based on dragFrom state
 */

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated/mock');
  return {
    ...actual,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (cb: () => unknown) => cb(),
    withRepeat: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    cancelAnimation: jest.fn(),
  };
});

jest.mock('@/utils/haptics', () => ({
  hapticLight: jest.fn(() => Promise.resolve()),
  hapticMedium: jest.fn(() => Promise.resolve()),
}));

// ---------------------------------------------------------------------------
// swapSlots logic (tested via useScoreGameScreen)
// ---------------------------------------------------------------------------

import { useScoreGameScreen } from '@/components/screens/Games/useScoreGameScreen';
import type { RosterPlayer } from '@/components/screens/Games/useScoreGameScreen';

jest.mock('@/lib/api', () => ({
  api: {
    searchPlayers: jest.fn(async () => ({ items: [] })),
    getFriends: jest.fn(async () => []),
    getCurrentUserPlayer: jest.fn(async () => null),
    getSessionParticipants: jest.fn(async () => []),
    getLeague: jest.fn(async () => ({})),
  },
}));

jest.mock('@/contexts/AddNewPlayerContext', () => ({
  useAddNewPlayer: () => ({
    result: null,
    setRequest: jest.fn(),
    consumeResult: jest.fn(() => null),
  }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useFocusEffect: jest.fn(),
}));

const PLAYER_A: RosterPlayer = {
  player_id: 1,
  display_name: 'Alice Smith',
  initials: 'AS',
  tags: [],
  isSession: false,
};

const PLAYER_B: RosterPlayer = {
  player_id: 2,
  display_name: 'Bob Jones',
  initials: 'BJ',
  tags: [],
  isSession: false,
};

const PLAYER_C: RosterPlayer = {
  player_id: 3,
  display_name: 'Carol White',
  initials: 'CW',
  tags: [],
  isSession: false,
};

const PLAYER_D: RosterPlayer = {
  player_id: 4,
  display_name: 'Dave Brown',
  initials: 'DB',
  tags: [],
  isSession: false,
};

function fillAllSlots(result: ReturnType<typeof useScoreGameScreen>): void {
  act(() => { result.assignPlayer(1, 0, PLAYER_A); });
  act(() => { result.assignPlayer(1, 1, PLAYER_B); });
  act(() => { result.assignPlayer(2, 0, PLAYER_C); });
  act(() => { result.assignPlayer(2, 1, PLAYER_D); });
}

describe('swapSlots', () => {
  it('swaps players across teams (team1[0] <-> team2[0])', () => {
    const { result } = renderHook(() => useScoreGameScreen());
    fillAllSlots(result.current);

    act(() => {
      result.current.swapSlots({ team: 1, slot: 0 }, { team: 2, slot: 0 });
    });

    expect(result.current.team1[0].player_id).toBe(PLAYER_C.player_id);
    expect(result.current.team2[0].player_id).toBe(PLAYER_A.player_id);
    // Untouched slots unchanged
    expect(result.current.team1[1].player_id).toBe(PLAYER_B.player_id);
    expect(result.current.team2[1].player_id).toBe(PLAYER_D.player_id);
  });

  it('swaps players across teams (team1[1] <-> team2[1])', () => {
    const { result } = renderHook(() => useScoreGameScreen());
    fillAllSlots(result.current);

    act(() => {
      result.current.swapSlots({ team: 1, slot: 1 }, { team: 2, slot: 1 });
    });

    expect(result.current.team1[1].player_id).toBe(PLAYER_D.player_id);
    expect(result.current.team2[1].player_id).toBe(PLAYER_B.player_id);
    expect(result.current.team1[0].player_id).toBe(PLAYER_A.player_id);
    expect(result.current.team2[0].player_id).toBe(PLAYER_C.player_id);
  });

  it('swaps players within team 1', () => {
    const { result } = renderHook(() => useScoreGameScreen());
    fillAllSlots(result.current);

    act(() => {
      result.current.swapSlots({ team: 1, slot: 0 }, { team: 1, slot: 1 });
    });

    expect(result.current.team1[0].player_id).toBe(PLAYER_B.player_id);
    expect(result.current.team1[1].player_id).toBe(PLAYER_A.player_id);
    // Team 2 unchanged
    expect(result.current.team2[0].player_id).toBe(PLAYER_C.player_id);
    expect(result.current.team2[1].player_id).toBe(PLAYER_D.player_id);
  });

  it('swaps players within team 2', () => {
    const { result } = renderHook(() => useScoreGameScreen());
    fillAllSlots(result.current);

    act(() => {
      result.current.swapSlots({ team: 2, slot: 0 }, { team: 2, slot: 1 });
    });

    expect(result.current.team2[0].player_id).toBe(PLAYER_D.player_id);
    expect(result.current.team2[1].player_id).toBe(PLAYER_C.player_id);
    // Team 1 unchanged
    expect(result.current.team1[0].player_id).toBe(PLAYER_A.player_id);
    expect(result.current.team1[1].player_id).toBe(PLAYER_B.player_id);
  });

  it('is a no-op when from and to are the same slot', () => {
    const { result } = renderHook(() => useScoreGameScreen());
    fillAllSlots(result.current);

    const before1 = result.current.team1;
    const before2 = result.current.team2;

    act(() => {
      result.current.swapSlots({ team: 1, slot: 0 }, { team: 1, slot: 0 });
    });

    expect(result.current.team1).toBe(before1);
    expect(result.current.team2).toBe(before2);
  });

  it('cross-team: team2[0] -> team1[1] leaves other slots untouched', () => {
    const { result } = renderHook(() => useScoreGameScreen());
    fillAllSlots(result.current);

    act(() => {
      result.current.swapSlots({ team: 2, slot: 0 }, { team: 1, slot: 1 });
    });

    expect(result.current.team1[1].player_id).toBe(PLAYER_C.player_id);
    expect(result.current.team2[0].player_id).toBe(PLAYER_B.player_id);
    expect(result.current.team1[0].player_id).toBe(PLAYER_A.player_id);
    expect(result.current.team2[1].player_id).toBe(PLAYER_D.player_id);
  });
});

// ---------------------------------------------------------------------------
// useScoreBoardDrag hook
// ---------------------------------------------------------------------------

import { useScoreBoardDrag } from '@/components/screens/Games/useScoreBoardDrag';
import type { SlotKey } from '@/components/screens/Games/useScoreBoardDrag';

function makeMockView(x: number, y: number, w: number, h: number) {
  return {
    measureInWindow: (cb: (x: number, y: number, w: number, h: number) => void) => {
      cb(x, y, w, h);
    },
  };
}

describe('useScoreBoardDrag', () => {
  it('sets dragFrom and clears dragTarget on drag start', async () => {
    const onSwap = jest.fn();
    const { result } = renderHook(() => useScoreBoardDrag({ onSwap }));

    await act(async () => {
      result.current.onChipDragStart(1, 0, 100, 200);
    });

    expect(result.current.dragFrom).toEqual({ team: 1, slot: 0 });
    expect(result.current.dragTarget).toBeNull();
  });

  it('calls onSwap and clears state when dropped on a different slot', async () => {
    const onSwap = jest.fn();
    const { result } = renderHook(() => useScoreBoardDrag({ onSwap }));

    // Register chip refs with known layouts so hitTest can resolve
    const mockView0 = makeMockView(0, 0, 100, 50);
    const mockView1 = makeMockView(0, 60, 100, 50);

    act(() => {
      result.current.setChipRef('t1s0', mockView0 as never);
      result.current.setChipRef('t1s1', mockView1 as never);
    });

    await act(async () => {
      result.current.onChipDragStart(1, 0, 50, 25);
    });

    act(() => {
      result.current.onChipDragEnd(50, 85);
    });

    expect(onSwap).toHaveBeenCalledWith(
      { team: 1, slot: 0 },
      { team: 1, slot: 1 },
    );
    expect(result.current.dragFrom).toBeNull();
    expect(result.current.dragTarget).toBeNull();
  });

  it('does not call onSwap when dropped on the same slot', async () => {
    const onSwap = jest.fn();
    const { result } = renderHook(() => useScoreBoardDrag({ onSwap }));

    const mockView0 = makeMockView(0, 0, 100, 50);

    act(() => {
      result.current.setChipRef('t1s0', mockView0 as never);
    });

    await act(async () => {
      result.current.onChipDragStart(1, 0, 50, 25);
    });

    act(() => {
      result.current.onChipDragEnd(50, 25);
    });

    expect(onSwap).not.toHaveBeenCalled();
    expect(result.current.dragFrom).toBeNull();
  });

  it('clears all state on drag cancel', async () => {
    const onSwap = jest.fn();
    const { result } = renderHook(() => useScoreBoardDrag({ onSwap }));

    await act(async () => {
      result.current.onChipDragStart(2, 1, 50, 25);
    });

    act(() => {
      result.current.onChipDragCancel();
    });

    expect(result.current.dragFrom).toBeNull();
    expect(result.current.dragTarget).toBeNull();
    expect(onSwap).not.toHaveBeenCalled();
  });

  it('updates dragTarget during move', async () => {
    const onSwap = jest.fn();
    const { result } = renderHook(() => useScoreBoardDrag({ onSwap }));

    const mockView1 = makeMockView(200, 60, 100, 50);
    act(() => {
      result.current.setChipRef('t2s0', mockView1 as never);
    });

    await act(async () => {
      result.current.onChipDragStart(1, 0, 50, 25);
    });

    act(() => {
      result.current.onChipDragMove(250, 85);
    });

    expect(result.current.dragTarget).toEqual({ team: 2, slot: 0 });
  });

  it('returns null dragTarget when move is outside all chips', async () => {
    const onSwap = jest.fn();
    const { result } = renderHook(() => useScoreBoardDrag({ onSwap }));

    await act(async () => {
      result.current.onChipDragStart(1, 0, 50, 25);
    });

    act(() => {
      result.current.onChipDragMove(9999, 9999);
    });

    expect(result.current.dragTarget).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// toChipKey utility
// ---------------------------------------------------------------------------

import { toChipKey } from '@/components/screens/Games/useScoreBoardDrag';

describe('toChipKey', () => {
  it('produces the correct key strings', () => {
    expect(toChipKey(1, 0)).toBe('t1s0');
    expect(toChipKey(1, 1)).toBe('t1s1');
    expect(toChipKey(2, 0)).toBe('t2s0');
    expect(toChipKey(2, 1)).toBe('t2s1');
  });
});
