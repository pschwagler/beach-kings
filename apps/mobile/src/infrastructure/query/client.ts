import NetInfo from '@react-native-community/netinfo';
import {
  focusManager,
  onlineManager,
  QueryClient,
} from '@tanstack/react-query';
import { AppState } from 'react-native';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: 1,
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
  const unsubscribeNetwork = NetInfo.addEventListener((state) => {
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
