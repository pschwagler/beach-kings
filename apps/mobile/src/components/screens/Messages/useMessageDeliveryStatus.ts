import { useEffect, useState } from 'react';
import type { ModerationVisibility } from '@beach-kings/shared';

export const MATERIAL_DELIVERY_DELAY_MS = 30_000;
export const PENDING_DELIVERY_REFETCH_MS = 5_000;

export function messageDeliveryStatus(
  visibility: ModerationVisibility | undefined,
  createdAt: string | null,
  now = Date.now(),
): string | null {
  if (visibility !== 'pending' || !createdAt) return null;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created) || now - created < MATERIAL_DELIVERY_DELAY_MS) return null;
  return 'Delivery delayed';
}

export function pendingDeliveryRefetchInterval(
  hasOwnedPendingMessage: boolean,
): number | false {
  return hasOwnedPendingMessage ? PENDING_DELIVERY_REFETCH_MS : false;
}

export function useMessageDeliveryStatus(
  visibility: ModerationVisibility | undefined,
  createdAt: string | null,
): string | null {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (visibility !== 'pending' || !createdAt) return;
    const created = new Date(createdAt).getTime();
    if (!Number.isFinite(created)) return;
    const remaining = MATERIAL_DELIVERY_DELAY_MS - (Date.now() - created);
    if (remaining <= 0) return;
    const timer = setTimeout(() => refresh((value) => value + 1), remaining);
    return () => clearTimeout(timer);
  }, [createdAt, visibility]);
  return messageDeliveryStatus(visibility, createdAt);
}
