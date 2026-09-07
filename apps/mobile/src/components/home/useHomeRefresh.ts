import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export const HOME_REFRESH_BUDGET_MS = 30_000;
const TIMEOUT_MESSAGE = 'Refresh took too long. Check your connection and try again.';

function cancelWork(cancel: () => Promise<void>): void {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // UI cleanup is unconditional even if a cancellation adapter fails.
  }
}

/** UI transaction only. Query continues to own data, errors and cancellation. */
export function useHomeRefresh(
  refetch: () => Promise<void>,
  cancel: () => Promise<void>,
  identity: number | undefined,
) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callbacks = useRef({ refetch, cancel });
  callbacks.current = { refetch, cancel };
  const sequence = useRef(0);
  const active = useRef<{ id: number; timer: ReturnType<typeof setTimeout>; cancel: () => Promise<void> } | null>(null);

  const reset = useCallback((updateUI = true) => {
    const current = active.current;
    active.current = null;
    sequence.current += 1;
    if (current != null) {
      clearTimeout(current.timer);
      cancelWork(current.cancel);
    }
    if (updateUI) {
      setRefreshing(false);
      setError(null);
    }
  }, []);

  useEffect(() => {
    reset();
    return () => reset(false);
  }, [identity, reset]);

  useFocusEffect(useCallback(() => () => reset(), [reset]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') reset();
    });
    return () => subscription.remove();
  }, [reset]);

  const onRefresh = useCallback(() => {
    if (active.current != null) return;
    const id = ++sequence.current;
    const { refetch: run, cancel: cancelRun } = callbacks.current;
    setError(null);
    setRefreshing(true);
    AccessibilityInfo.announceForAccessibility('Refreshing Home');
    const finish = (message: string | null) => {
      if (active.current?.id !== id) return;
      clearTimeout(active.current.timer);
      active.current = null;
      setRefreshing(false);
      setError(message);
      if (message != null) Alert.alert('Could not refresh Home', message);
      else AccessibilityInfo.announceForAccessibility('Home refreshed');
    };
    const timer = setTimeout(() => {
      if (active.current?.id !== id) return;
      cancelWork(cancelRun);
      finish(TIMEOUT_MESSAGE);
    }, HOME_REFRESH_BUDGET_MS);
    active.current = { id, timer, cancel: cancelRun };
    void Promise.resolve().then(() => {
      if (active.current?.id === id) return run();
    }).then(
      () => finish(null),
      () => finish('Could not refresh every section. Check your connection and try again.'),
    );
  }, []);

  return { refreshing, error, onRefresh };
}
