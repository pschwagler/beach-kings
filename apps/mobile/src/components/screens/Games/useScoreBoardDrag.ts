/**
 * Drag-and-drop state for the ScoreBoard's 4 fixed player chips.
 *
 * Chip positions are measured once on drag-start via `measureInWindow`
 * and reused for the duration of that drag.
 */
import { useRef, useState, useCallback } from 'react';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { hapticLight, hapticMedium } from '@/utils/haptics';

export interface SlotKey {
  readonly team: 1 | 2;
  readonly slot: 0 | 1;
}

/** Compound key for addressing each of the 4 chip positions. */
export type ChipKey = 't1s0' | 't1s1' | 't2s0' | 't2s1';

export function toChipKey(team: 1 | 2, slot: 0 | 1): ChipKey {
  return `t${team}s${slot}` as ChipKey;
}

interface Layout {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface UseDragDropOptions {
  readonly onSwap: (from: SlotKey, to: SlotKey) => void;
}

function hitTest(absX: number, absY: number, layouts: Map<ChipKey, Layout>): SlotKey | null {
  for (const [key, layout] of layouts) {
    if (
      absX >= layout.x &&
      absX <= layout.x + layout.width &&
      absY >= layout.y &&
      absY <= layout.y + layout.height
    ) {
      return {
        team: parseInt(key[1] ?? '0', 10) as 1 | 2,
        slot: parseInt(key[3] ?? '0', 10) as 0 | 1,
      };
    }
  }
  return null;
}

export function useScoreBoardDrag({ onSwap }: UseDragDropOptions) {
  const chipRefs = useRef<Map<ChipKey, View | null>>(new Map());
  const chipLayouts = useRef<Map<ChipKey, Layout>>(new Map());
  const boardRef = useRef<View>(null);
  const boardLayout = useRef<Layout | null>(null);
  // Ref (not state) so onChipDragEnd callback stays current without stale closure
  const dragFromRef = useRef<SlotKey | null>(null);

  const [dragFrom, setDragFrom] = useState<SlotKey | null>(null);
  const [dragTarget, setDragTarget] = useState<SlotKey | null>(null);

  const ghostX = useSharedValue(0);
  const ghostY = useSharedValue(0);

  const setChipRef = useCallback((key: ChipKey, ref: View | null): void => {
    chipRefs.current.set(key, ref);
  }, []);

  const measureAll = useCallback((): Promise<void> => {
    const tasks: Promise<void>[] = [];

    chipRefs.current.forEach((ref, key) => {
      if (ref == null) return;
      tasks.push(
        new Promise<void>((resolve) => {
          ref.measureInWindow((x, y, w, h) => {
            chipLayouts.current.set(key, { x, y, width: w, height: h });
            resolve();
          });
        }),
      );
    });

    if (boardRef.current != null) {
      tasks.push(
        new Promise<void>((resolve) => {
          boardRef.current!.measureInWindow((x, y, w, h) => {
            boardLayout.current = { x, y, width: w, height: h };
            resolve();
          });
        }),
      );
    }

    return tasks.length > 0 ? Promise.all(tasks).then(() => undefined) : Promise.resolve();
  }, []);

  const onChipDragStart = useCallback(
    (team: 1 | 2, slot: 0 | 1, absX: number, absY: number): void => {
      dragFromRef.current = { team, slot };
      void hapticLight();
      void measureAll().then(() => {
        const board = boardLayout.current;
        if (board != null) {
          ghostX.value = absX - board.x;
          ghostY.value = absY - board.y;
        }
        setDragFrom({ team, slot });
        setDragTarget(null);
      });
    },
    [measureAll, ghostX, ghostY],
  );

  const onChipDragMove = useCallback(
    (absX: number, absY: number): void => {
      const board = boardLayout.current;
      if (board != null) {
        ghostX.value = absX - board.x;
        ghostY.value = absY - board.y;
      }
      const hit = hitTest(absX, absY, chipLayouts.current);
      setDragTarget((prev) =>
        prev?.team === hit?.team && prev?.slot === hit?.slot ? prev : hit,
      );
    },
    [ghostX, ghostY],
  );

  const onChipDragEnd = useCallback(
    (absX: number, absY: number): void => {
      const hit = hitTest(absX, absY, chipLayouts.current);
      const from = dragFromRef.current;

      if (hit != null && from != null) {
        const isSame = hit.team === from.team && hit.slot === from.slot;
        if (!isSame) {
          onSwap(from, hit);
          void hapticMedium();
        }
      }

      dragFromRef.current = null;
      setDragFrom(null);
      setDragTarget(null);
    },
    [onSwap],
  );

  const onChipDragCancel = useCallback((): void => {
    dragFromRef.current = null;
    setDragFrom(null);
    setDragTarget(null);
  }, []);

  return {
    boardRef,
    setChipRef,
    dragFrom,
    dragTarget,
    ghostX,
    ghostY,
    onChipDragStart,
    onChipDragMove,
    onChipDragEnd,
    onChipDragCancel,
  } as const;
}
