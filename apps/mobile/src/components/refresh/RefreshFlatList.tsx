import React, { forwardRef } from 'react';
import { FlatList, View, type FlatListProps } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useExplicitRefresh } from './useExplicitRefresh';
import { useRefreshGesture } from './useRefreshGesture';
import { RefreshAction, RefreshOverlay } from './RefreshFeedback';
import type { RefreshProps } from './RefreshScrollView';

type Props<T> = Omit<FlatListProps<T>, 'onRefresh'> & RefreshProps;

/** Keeps the actual virtualized list, its ref and its footer intact. The stable
 * external action does not change content size (especially important in chat).
 * With no callback, no action or refresh gesture is installed.
 */
function RefreshFlatListController<T>({ onRefresh, refreshScope = '', refreshLabel = 'content', forwardedRef, ...props }: Props<T> & { forwardedRef: React.ForwardedRef<FlatList<T>> }) {
  const { user } = useAuth();
  const scope = `${user?.id ?? 0}:${refreshScope}`;
  const state = useExplicitRefresh(onRefresh ?? (() => undefined), scope, refreshLabel);
  const { scrollProps, pull } = useRefreshGesture(props, state.refreshing, onRefresh ? state.onRefresh : undefined, scope);
  return <View className="flex-1">
    {onRefresh && <RefreshAction state={state} label={refreshLabel} />}
    <FlatList {...props} {...scrollProps} ref={forwardedRef} refreshing={undefined} onRefresh={undefined} />
    {onRefresh && <RefreshOverlay state={state} pull={pull} />}
  </View>;
}
function RefreshFlatListInner<T>(props: Props<T>, ref: React.ForwardedRef<FlatList<T>>) {
  // League Chat deliberately has no refresh behavior, extra chrome, or hooks.
  if (!props.onRefresh) return <FlatList {...props} ref={ref} onRefresh={undefined} />;
  return <RefreshFlatListController {...props} forwardedRef={ref} />;
}
export default forwardRef(RefreshFlatListInner) as <T>(props: Props<T> & { ref?: React.ForwardedRef<FlatList<T>> }) => React.ReactElement;
