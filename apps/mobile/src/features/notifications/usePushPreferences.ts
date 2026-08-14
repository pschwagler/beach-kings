import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PushNotificationPrefs } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { notificationKeys } from './keys';
import { notificationQueries } from './queries';

export function usePushPreferences() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const enabled = isAuthenticated && userId > 0;
  const queryClient = useQueryClient();
  const query = useQuery(notificationQueries.preferences(userId, enabled));
  const mutation = useMutation({
    mutationFn: (updates: Partial<PushNotificationPrefs>) =>
      api.updatePushNotificationPrefs(updates),
    onMutate: async (updates) => {
      const key = notificationKeys.preferences(userId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PushNotificationPrefs>(key);
      if (previous != null) {
        queryClient.setQueryData(key, { ...previous, ...updates });
      }
      return { previous };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous != null) {
        queryClient.setQueryData(
          notificationKeys.preferences(userId),
          context.previous,
        );
      }
    },
    onSuccess: (prefs) => {
      queryClient.setQueryData(notificationKeys.preferences(userId), prefs);
    },
    onSettled: () => queryClient.invalidateQueries({
      queryKey: notificationKeys.preferences(userId),
    }),
  });

  return {
    ...query,
    prefs: query.data ?? null,
    updatePreferences: mutation.mutateAsync,
    isSaving: mutation.isPending,
  };
}
