import { useCallback } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import type { LeaguePicture, LeaguePictureThumbnails } from '@beach-kings/shared';
import { leagueKeys } from './keys';
import { leagueQueries } from './queries';

const MAX_BATCH_SIZE = 25;

export function useLeaguePictureThumbnails(
  userId: number,
  leagueIds: readonly number[],
): { pictures: LeaguePictureThumbnails; refreshPictures: () => Promise<void> } {
  const client = useQueryClient();
  const sortedIds = [...new Set(leagueIds)].sort((a, b) => a - b);
  const batches: number[][] = [];
  for (let start = 0; start < sortedIds.length; start += MAX_BATCH_SIZE) {
    batches.push(sortedIds.slice(start, start + MAX_BATCH_SIZE));
  }
  const queries = useQueries({
    queries: batches.map((ids) => leagueQueries.pictureThumbnails(userId, ids)),
  });

  const refreshPictures = useCallback(() => client.invalidateQueries(
    { queryKey: leagueKeys.pictureThumbnailsRoot(userId) },
    { cancelRefetch: false },
  ), [client, userId]);

  useFocusEffect(useCallback(() => {
    void refreshPictures();
  }, [refreshPictures]));

  const pictures: Partial<Record<number, LeaguePicture>> = {};
  for (const query of queries) {
    if (query.isSuccess && query.fetchStatus === 'idle') Object.assign(pictures, query.data);
  }
  return { pictures, refreshPictures };
}
