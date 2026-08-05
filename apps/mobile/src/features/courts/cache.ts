import type { QueryClient } from '@tanstack/react-query';

import { courtKeys } from './keys';

/** Marks every viewer-specific court view stale after a court mutation. */
export async function invalidateCourtQueries(
  queryClient: QueryClient,
  userId: number,
): Promise<void> {
  if (userId <= 0) return;
  await queryClient.invalidateQueries({ queryKey: courtKeys.all(userId) });
}
