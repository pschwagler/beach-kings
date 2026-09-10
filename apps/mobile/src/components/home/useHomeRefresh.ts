import { useExplicitRefresh } from '@/components/refresh/useExplicitRefresh';
export { REFRESH_BUDGET_MS as HOME_REFRESH_BUDGET_MS } from '@/components/refresh/useExplicitRefresh';
/** Compatibility facade; leaving Home must not abort another screen's shared query. */
export function useHomeRefresh(refetch: () => Promise<unknown>, _cancel: () => Promise<void>, identity: number | undefined) {
  return useExplicitRefresh(refetch, String(identity), 'Home');
}
