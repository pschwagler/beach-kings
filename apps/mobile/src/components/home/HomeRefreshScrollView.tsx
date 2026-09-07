import React, { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, AppState, Platform, Pressable, RefreshControl, ScrollView, View,
  type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import AppText from '@/components/ui/AppText';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { useReducedMotion } from '@/hooks/useReducedMotion';

export const HOME_PULL_THRESHOLD = 72;
type PullState = 'idle' | 'pulling' | 'armed';

interface Props extends ScrollViewProps {
  readonly refreshing: boolean;
  readonly refreshError: string | null;
  readonly onRefresh: () => void;
}

function distanceFromTop(event: NativeSyntheticEvent<NativeScrollEvent>): number {
  return -(event.nativeEvent.contentOffset.y + (event.nativeEvent.contentInset?.top ?? 0));
}

/** iOS refresh never mutates native contentInset, padding or contentOffset. */
const HomeRefreshScrollView = forwardRef<ScrollView, Props>(function HomeRefreshScrollView(
  { children, refreshing, refreshError, onRefresh, ...props }, ref,
) {
  const palette = usePaletteColors();
  const reduceMotion = useReducedMotion();
  const [pullState, setPullState] = useState<PullState>('idle');
  const draggingFromTop = useRef(false);
  const resetGesture = useCallback(() => {
    draggingFromTop.current = false;
    setPullState('idle');
  }, []);
  useFocusEffect(useCallback(() => () => resetGesture(), [resetGesture]));
  useEffect(() => {
    if (refreshing) resetGesture();
  }, [refreshing, resetGesture]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') resetGesture();
    });
    return () => subscription.remove();
  }, [resetGesture]);

  const ios = Platform.OS === 'ios';
  const gestureProps: ScrollViewProps = ios ? {
    refreshControl: undefined,
    alwaysBounceVertical: true,
    scrollEventThrottle: 16,
    onScrollBeginDrag: event => {
      draggingFromTop.current = !refreshing && distanceFromTop(event) >= -1;
    },
    onScroll: event => {
      if (!draggingFromTop.current || refreshing) return;
      const distance = distanceFromTop(event);
      setPullState(distance >= HOME_PULL_THRESHOLD ? 'armed' : distance > 8 ? 'pulling' : 'idle');
    },
    onScrollEndDrag: event => {
      const shouldRefresh = draggingFromTop.current && !refreshing
        && distanceFromTop(event) >= HOME_PULL_THRESHOLD;
      resetGesture();
      if (shouldRefresh) onRefresh();
    },
    onTouchCancel: resetGesture,
  } : {
    refreshControl: <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.brandTeal} />,
  };

  const showIndicator = ios && (refreshing || pullState !== 'idle');
  return (
    <View className="flex-1">
      <ScrollView
        {...props}
        {...gestureProps}
        ref={ref}
        accessibilityActions={[{ name: 'refresh', label: 'Refresh Home' }]}
        onAccessibilityAction={event => {
          if (event.nativeEvent.actionName === 'refresh' && !refreshing) onRefresh();
        }}
      >
        {children}
        <View className="px-lg pb-lg items-center">
          {refreshError != null && (
            <AppText accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-footnote text-danger mb-sm text-center">
              {refreshError}
            </AppText>
          )}
          <Pressable
            onPress={onRefresh}
            disabled={refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh Home"
            accessibilityState={{ disabled: refreshing, busy: refreshing }}
            className="min-h-11 px-lg justify-center"
          >
            <AppText className="text-footnote font-medium text-brand-teal">
              {refreshing ? 'Refreshing…' : 'Refresh Home'}
            </AppText>
          </Pressable>
        </View>
      </ScrollView>
      {showIndicator && (
        <View pointerEvents="none" testID="home-refresh-indicator" className="absolute top-sm self-center flex-row items-center gap-sm rounded-full bg-surface px-md py-sm">
          {refreshing && !reduceMotion && <ActivityIndicator color={palette.brandTeal} size="small" />}
          <AppText accessibilityLiveRegion="polite" className="text-footnote text-default">
            {refreshing ? 'Refreshing…' : pullState === 'armed' ? 'Release to refresh' : 'Pull to refresh'}
          </AppText>
        </View>
      )}
    </View>
  );
});

export default HomeRefreshScrollView;
