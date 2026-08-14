/**
 * useHeaderAction — lets a Social hub tab publish a right-hand action into the
 * shared "Social" TopNav.
 *
 * The hub owns a single TopNav; each active tab supplies its own action
 * (Messages → compose, Notifications → mark-all) by calling the `setHeaderAction`
 * setter the hub passes down. The action is cleared on unmount so switching tabs
 * never leaves a stale control behind.
 *
 * IMPORTANT: pass a memoized `node` (via `useMemo`) — a fresh JSX element every
 * render would retrigger the effect and loop. Memoize on the action's real deps.
 */

import { useEffect } from 'react';
import type React from 'react';

export type SetHeaderAction = (node: React.ReactNode | null) => void;

export function useHeaderAction(
  setHeaderAction: SetHeaderAction | undefined,
  node: React.ReactNode,
): void {
  useEffect(() => {
    setHeaderAction?.(node);
    return () => setHeaderAction?.(null);
  }, [setHeaderAction, node]);
}
