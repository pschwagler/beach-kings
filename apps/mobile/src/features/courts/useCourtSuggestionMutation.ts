import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { SuggestCourtEditInput } from '@beach-kings/shared';

import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { invalidateCourtQueries } from './cache';
import { courtKeys } from './keys';

export interface CourtSuggestionVariables extends SuggestCourtEditInput {
  readonly courtId: number;
}

export function useCourtSuggestionMutation() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: [...courtKeys.all(userId), 'suggest-edit'] as const,
    mutationFn: ({ courtId, changes, note }: CourtSuggestionVariables) =>
      api.suggestCourtEdit(courtId, { changes, note }),
    onSuccess: () => invalidateCourtQueries(queryClient, userId),
  });
}
