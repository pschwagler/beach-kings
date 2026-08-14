import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
} from 'react-native';

const EDGE_TOLERANCE = 2;

interface ItemLayout {
  readonly width: number;
  readonly x: number;
}

interface OverflowEdges {
  readonly backward: boolean;
  readonly forward: boolean;
}

export function centeredHorizontalOffset(
  contentWidth: number,
  viewportWidth: number,
  itemX: number,
  itemWidth: number,
): number {
  const maximumOffset = Math.max(0, contentWidth - viewportWidth);
  return Math.min(
    maximumOffset,
    Math.max(0, itemX + itemWidth / 2 - viewportWidth / 2),
  );
}

/**
 * Shared behavior for compact horizontal navigation and filter rows.
 *
 * It keeps the selected item in view without moving accessibility focus and
 * reports directional overflow so the UI can show a non-interactive edge cue.
 */
export function useHorizontalOverflow(selectedValue?: string) {
  const scrollRef = useRef<ScrollView>(null);
  const itemLayouts = useRef(new Map<string, ItemLayout>());
  const metrics = useRef({ contentWidth: 0, offsetX: 0, viewportWidth: 0 });
  const [edges, setEdges] = useState<OverflowEdges>({
    backward: false,
    forward: false,
  });

  const updateEdges = useCallback(() => {
    const { contentWidth, offsetX, viewportWidth } = metrics.current;
    const next = {
      backward: offsetX > EDGE_TOLERANCE,
      forward: contentWidth - viewportWidth - offsetX > EDGE_TOLERANCE,
    };
    setEdges((current) =>
      current.backward === next.backward && current.forward === next.forward
        ? current
        : next,
    );
  }, []);

  const centerItem = useCallback(
    (value: string, animated = true) => {
      const item = itemLayouts.current.get(value);
      const { contentWidth, viewportWidth } = metrics.current;
      if (item == null || viewportWidth <= 0) return;

      const nextOffset = centeredHorizontalOffset(
        contentWidth,
        viewportWidth,
        item.x,
        item.width,
      );
      scrollRef.current?.scrollTo({ x: nextOffset, animated });
    },
    [],
  );

  useEffect(() => {
    if (selectedValue != null) centerItem(selectedValue);
  }, [centerItem, selectedValue]);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      metrics.current.viewportWidth = event.nativeEvent.layout.width;
      updateEdges();
      if (selectedValue != null) centerItem(selectedValue, false);
    },
    [centerItem, selectedValue, updateEdges],
  );

  const onContentSizeChange = useCallback(
    (width: number) => {
      metrics.current.contentWidth = width;
      updateEdges();
      if (selectedValue != null) centerItem(selectedValue, false);
    },
    [centerItem, selectedValue, updateEdges],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      metrics.current.offsetX = Math.max(0, event.nativeEvent.contentOffset.x);
      updateEdges();
    },
    [updateEdges],
  );

  const onItemLayout = useCallback(
    (value: string, event: LayoutChangeEvent) => {
      const { width, x } = event.nativeEvent.layout;
      itemLayouts.current.set(value, { width, x });
      if (value === selectedValue) centerItem(value, false);
    },
    [centerItem, selectedValue],
  );

  return {
    canScrollBackward: edges.backward,
    canScrollForward: edges.forward,
    centerItem,
    onContentSizeChange,
    onItemLayout,
    onLayout,
    onScroll,
    scrollRef,
  };
}
