import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';
import * as Device from 'expo-device';
import { queryRetryDelay, shouldRetryQuery } from './retryPolicy';

const QUERY_GC_TIME = process.env.NODE_ENV === 'test' ? Infinity : 5 * 60_000;

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: QUERY_GC_TIME,
        retry: shouldRetryQuery,
        retryDelay: queryRetryDelay,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

/**
 * Bridge native lifecycle/network signals into Query. React Native does not
 * emit browser focus or online events, so Query needs these explicit signals
 * for foreground and reconnect refetches.
 */
export function subscribeQueryLifecycle(): () => void {
  focusManager.setFocused(AppState.currentState === 'active');
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    focusManager.setFocused(state === 'active');
  });
  // iOS Simulator can report `none` while requests to the host API succeed.
  // Let requests determine reachability there; physical devices keep offline gating.
  const simulator = __DEV__ && Platform.OS === 'ios' && !Device.isDevice;
  if (simulator) onlineManager.setOnline(true);
  const unsubscribeNetwork = simulator
    ? () => {}
    : NetInfo.addEventListener((state) => {
        onlineManager.setOnline(
          state.isConnected === true && state.isInternetReachable !== false,
        );
      });

  return () => {
    appStateSubscription.remove();
    unsubscribeNetwork();
    focusManager.setFocused(undefined);
  };
}
