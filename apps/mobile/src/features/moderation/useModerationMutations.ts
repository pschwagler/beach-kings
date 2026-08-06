import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BlockedPlayer, ReportInput } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { privateKeys } from '@/infrastructure/query/keys';
import { api } from '@/lib/api';
import { moderationKeys } from './keys';
import { applyPlayerBlock, rollbackPlayerBlock } from './cache';

let moderationSequence = 0;

function nextToken(action: string): string {
  moderationSequence += 1;
  return `${action}:${moderationSequence}`;
}

export function useModerationMutations() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();

  const invalidatePersonalized = () => queryClient.invalidateQueries({
    queryKey: privateKeys.user(userId),
  });

  const block = useMutation({
    mutationKey: [...moderationKeys.all(userId), 'block'] as const,
    mutationFn: (player: Pick<BlockedPlayer, 'player_id' | 'full_name' | 'avatar'>) =>
      api.blockPlayer(player.player_id),
    onMutate: async (player) => {
      await queryClient.cancelQueries({ queryKey: privateKeys.user(userId) });
      const blocksKey = moderationKeys.blocks(userId);
      const previousBlocks = queryClient.getQueryData<BlockedPlayer[]>(blocksKey);
      const optimisticBlocks = [
        {
          ...player,
          blocked_at: new Date().toISOString(),
        },
        ...(previousBlocks ?? []).filter((row) => row.player_id !== player.player_id),
      ];
      queryClient.setQueryData<BlockedPlayer[]>(blocksKey, optimisticBlocks);
      const interactionPatch = applyPlayerBlock(
        queryClient,
        userId,
        player.player_id,
        nextToken('block'),
      );
      return { previousBlocks, optimisticBlocks, interactionPatch };
    },
    onError: (_error, _player, context) => {
      const blocksKey = moderationKeys.blocks(userId);
      if (queryClient.getQueryData(blocksKey) === context?.optimisticBlocks) {
        queryClient.setQueryData(blocksKey, context?.previousBlocks);
      }
      rollbackPlayerBlock(queryClient, context?.interactionPatch);
    },
    onSettled: invalidatePersonalized,
  });

  const unblock = useMutation({
    mutationKey: [...moderationKeys.all(userId), 'unblock'] as const,
    mutationFn: (playerId: number) => api.unblockPlayer(playerId),
    onMutate: async (playerId) => {
      await queryClient.cancelQueries({ queryKey: privateKeys.user(userId) });
      const blocksKey = moderationKeys.blocks(userId);
      const previousBlocks = queryClient.getQueryData<BlockedPlayer[]>(blocksKey);
      const optimisticBlocks = (previousBlocks ?? []).filter(
        (row) => row.player_id !== playerId,
      );
      queryClient.setQueryData<BlockedPlayer[]>(blocksKey, optimisticBlocks);
      return { previousBlocks, optimisticBlocks };
    },
    onError: (_error, _playerId, context) => {
      const blocksKey = moderationKeys.blocks(userId);
      if (queryClient.getQueryData(blocksKey) === context?.optimisticBlocks) {
        queryClient.setQueryData(blocksKey, context?.previousBlocks);
      }
    },
    onSettled: invalidatePersonalized,
  });

  const report = useMutation({
    mutationKey: [...moderationKeys.all(userId), 'report'] as const,
    mutationFn: (input: ReportInput) => api.reportContent(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: moderationKeys.reports(userId) }),
  });

  return { block, unblock, report };
}
