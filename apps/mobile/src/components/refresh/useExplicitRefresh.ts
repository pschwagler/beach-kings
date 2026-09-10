import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Alert, AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';

export const REFRESH_BUDGET_MS = 30_000;

/** Query refetch resolves errors/paused results; Promise.allSettled also wraps failures. */
export function assertRefreshResult(result: unknown): void {
  if (Array.isArray(result)) {
    result.forEach(assertRefreshResult);
  } else if (result != null && typeof result === 'object') {
    const value = result as Record<string, unknown>;
    if (value.status === 'rejected' || value.isError === true || value.fetchStatus === 'paused') {
      throw new Error('Refresh did not complete.');
    }
    if (value.status === 'fulfilled') assertRefreshResult(value.value);
    if (value.refreshIncomplete === true) throw new Error('Some sections could not refresh.');
    if (value.data != null && typeof value.data === 'object') assertRefreshResult(value.data);
  }
}

/** UI lifetime is deliberately separate from shared Query fetch lifetime.
 * A blur must not cancel another observer's canonical request. Reads consume
 * Query's signal and have their own finite transport deadline; AuthContext owns
 * cancellation on identity transitions. No cache or data is owned here.
 */
export function useExplicitRefresh(run: () => unknown, scope: string, label: string) {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const callback = useRef(run);
  callback.current = run;
  const active = useRef<{ token: object; timer: ReturnType<typeof setTimeout> } | null>(null);
  const reset = useCallback((update = true) => {
    if (active.current) clearTimeout(active.current.timer);
    active.current = null;
    if (update) { setRefreshing(false); setError(null); }
  }, []);
  useEffect(() => { reset(); return () => reset(false); }, [scope, reset]);
  useFocusEffect(useCallback(() => () => reset(), [reset]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') reset();
    });
    return () => subscription.remove();
  }, [reset]);
  const onRefresh = useCallback(() => {
    if (active.current) return;
    const token = {};
    const request = callback.current;
    setRefreshing(true);
    setError(null);
    AccessibilityInfo.announceForAccessibility(`Refreshing ${label}`);
    const finish = (message: string | null) => {
      if (active.current?.token !== token) return;
      clearTimeout(active.current.timer);
      active.current = null;
      setRefreshing(false);
      setError(message);
      if (message) Alert.alert(`Could not refresh ${label}`, message);
      else AccessibilityInfo.announceForAccessibility(`${label} refreshed`);
    };
    active.current = { token, timer: setTimeout(() => {
      finish('Refresh took too long. Check your connection and try again.');
    }, REFRESH_BUDGET_MS) };
    void Promise.resolve().then(() => {
      if (active.current?.token !== token) return;
      return request();
    }).then(result => {
      assertRefreshResult(result);
      finish(null);
    }).catch(() => finish('Could not refresh every section. Check your connection and try again.'));
  }, [label]);
  return { refreshing, error, onRefresh };
}
