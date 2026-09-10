import React, { forwardRef } from 'react';
import { ScrollView, View, type ScrollViewProps } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useExplicitRefresh } from './useExplicitRefresh';
import { useRefreshGesture } from './useRefreshGesture';
import { RefreshAction, RefreshOverlay, type RefreshState } from './RefreshFeedback';

export interface RefreshProps {
  onRefresh?: () => unknown;
  refreshScope?: string;
  refreshLabel?: string;
}

export const RefreshScrollSurface = forwardRef<ScrollView, ScrollViewProps & {
  state: RefreshState; label: string; scope?: string; indicatorTestID?: string;
}>(function RefreshScrollSurface({ state, label, scope = '', indicatorTestID, children, ...props }, ref) {
  const { scrollProps, pull } = useRefreshGesture(props, state.refreshing, state.onRefresh, scope);
  return <View className="flex-1">
    <ScrollView {...scrollProps} ref={ref}>
      {children}
      <RefreshAction state={state} label={label} />
    </ScrollView>
    <RefreshOverlay state={state} pull={pull} testID={indicatorTestID} />
  </View>;
});

const RefreshScrollView = forwardRef<ScrollView, ScrollViewProps & RefreshProps>(function RefreshScrollView({
  onRefresh, refreshScope = '', refreshLabel = 'content', ...props
}, ref) {
  const { user } = useAuth();
  const scope = `${user?.id ?? 0}:${refreshScope}`;
  const state = useExplicitRefresh(onRefresh ?? (() => undefined), scope, refreshLabel);
  return <RefreshScrollSurface {...props} state={state} label={refreshLabel} scope={scope} ref={ref} />;
});
export default RefreshScrollView;
