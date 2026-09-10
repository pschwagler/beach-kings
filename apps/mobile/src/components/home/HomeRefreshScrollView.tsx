import React, { forwardRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import { RefreshScrollSurface } from '@/components/refresh/RefreshScrollView';
export { PULL_THRESHOLD as HOME_PULL_THRESHOLD } from '@/components/refresh/useRefreshGesture';
interface Props extends ScrollViewProps {
  readonly refreshing: boolean;
  readonly refreshError: string | null;
  readonly onRefresh: () => void;
  readonly refreshScope?: string;
}
const HomeRefreshScrollView = forwardRef<ScrollView, Props>(function HomeRefreshScrollView(
  { refreshing, refreshError, onRefresh, refreshScope, ...props }, ref,
) {
  return <RefreshScrollSurface {...props} ref={ref} scope={refreshScope} label="Home" indicatorTestID="home-refresh-indicator"
    state={{ refreshing, error: refreshError, onRefresh }} />;
});
export default HomeRefreshScrollView;
