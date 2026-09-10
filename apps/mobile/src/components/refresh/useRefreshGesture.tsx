import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform, RefreshControl, type ScrollViewProps, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { usePaletteColors } from '@/theme/usePaletteColors';

export const PULL_THRESHOLD = 72;
type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;
const distance = (event: ScrollEvent) => -(event.nativeEvent.contentOffset.y + (event.nativeEvent.contentInset?.top ?? 0));

export function useRefreshGesture(props: ScrollViewProps, refreshing: boolean, onRefresh: (() => void) | undefined, scope: string) {
  const palette = usePaletteColors();
  const [pull, setPull] = useState<'idle' | 'pulling' | 'armed'>('idle');
  const dragging = useRef(false);
  const reset = useCallback(() => { dragging.current = false; setPull('idle'); }, []);
  useFocusEffect(useCallback(() => () => reset(), [reset]));
  useEffect(() => { reset(); }, [scope, refreshing, reset]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { if (state !== 'active') reset(); });
    return () => subscription.remove();
  }, [reset]);
  if (!onRefresh) return { pull, scrollProps: props };
  const common: ScrollViewProps = {
    ...props,
    accessibilityActions: [...(props.accessibilityActions ?? []), { name: 'refresh', label: 'Refresh' }],
    onAccessibilityAction: event => {
      if (event.nativeEvent.actionName === 'refresh' && !refreshing) onRefresh();
      props.onAccessibilityAction?.(event);
    },
  };
  if (Platform.OS !== 'ios') return { pull, scrollProps: {
    ...common, refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brandTeal} />,
  } };
  return { pull, scrollProps: {
    ...common, refreshControl: undefined, alwaysBounceVertical: true, scrollEventThrottle: 16,
    onScrollBeginDrag: (event: ScrollEvent) => {
      dragging.current = !refreshing && distance(event) >= -1;
      props.onScrollBeginDrag?.(event);
    },
    onScroll: (event: ScrollEvent) => {
      if (dragging.current && !refreshing) {
        const amount = distance(event);
        setPull(amount >= PULL_THRESHOLD ? 'armed' : amount > 8 ? 'pulling' : 'idle');
      }
      props.onScroll?.(event);
    },
    onScrollEndDrag: (event: ScrollEvent) => {
      const armed = dragging.current && !refreshing && distance(event) >= PULL_THRESHOLD;
      reset();
      if (armed) onRefresh();
      props.onScrollEndDrag?.(event);
    },
    onTouchCancel: (event: Parameters<NonNullable<ScrollViewProps['onTouchCancel']>>[0]) => {
      reset(); props.onTouchCancel?.(event);
    },
  } };
}
