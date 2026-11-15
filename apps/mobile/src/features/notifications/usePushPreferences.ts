import { useCallback, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PushNotificationPrefs } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { notificationKeys } from './keys';
import { notificationQueries } from './queries';
import { withNotificationMutationDeadline } from './mutationDeadline';

let preferenceMutationSequence = 0;
const preferenceOwners = new Map<string, number>();

function preferenceOwnerKey(userId: number, key: keyof PushNotificationPrefs): string {
  return `${userId}:${key}`;
}

interface PreferenceMutationVariables {
  readonly userId: number;
  readonly updates: Partial<PushNotificationPrefs>;
}

export function usePushPreferences() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? 0;
  const enabled = isAuthenticated && userId > 0;
  const currentAccountRef = useRef({ userId, enabled });
  currentAccountRef.current = { userId, enabled };
  const queryClient = useQueryClient();
  const query = useQuery(notificationQueries.preferences(userId, enabled));
  const mutation = useMutation({
    mutationFn: ({ userId: mutationUserId, updates }: PreferenceMutationVariables) => {
      const currentAccount = currentAccountRef.current;
      if (!currentAccount.enabled || currentAccount.userId !== mutationUserId) {
        throw new Error('Notification preference action belongs to an obsolete account');
      }
      return withNotificationMutationDeadline(api.updatePushNotificationPrefs(updates));
    },
    onMutate: async ({ userId: mutationUserId, updates }) => {
      const key = notificationKeys.preferences(mutationUserId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PushNotificationPrefs>(key);
      const token = ++preferenceMutationSequence;
      const updateKeys = Object.keys(updates) as Array<keyof PushNotificationPrefs>;
      updateKeys.forEach((updateKey) => {
        preferenceOwners.set(preferenceOwnerKey(mutationUserId, updateKey), token);
      });
      if (previous != null) {
        queryClient.setQueryData(key, { ...previous, ...updates });
      }
      return { previous, token, updateKeys, userId: mutationUserId };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous != null) {
        const previous = context.previous;
        queryClient.setQueryData(
          notificationKeys.preferences(context.userId),
          (current: PushNotificationPrefs | undefined) => {
            if (current == null) return current;
            const restored = { ...current };
            context.updateKeys.forEach((updateKey) => {
              if (preferenceOwners.get(preferenceOwnerKey(context.userId, updateKey)) === context.token) {
                restored[updateKey] = previous[updateKey];
              }
            });
            return restored;
          },
        );
      }
    },
    onSuccess: (prefs, _updates, context) => {
      if (context == null) return;
      queryClient.setQueryData<PushNotificationPrefs>(
        notificationKeys.preferences(context.userId),
        (current) => {
          if (current == null) return current;
          const committed = { ...current };
          context.updateKeys.forEach((updateKey) => {
            if (
              preferenceOwners.get(preferenceOwnerKey(context.userId, updateKey)) ===
              context.token
            ) {
              committed[updateKey] = prefs[updateKey];
            }
          });
          return committed;
        },
      );
    },
    onSettled: (_data, _error, _updates, context) => {
      if (context == null) return;
      context.updateKeys.forEach((updateKey) => {
        const ownerKey = preferenceOwnerKey(context.userId, updateKey);
        if (preferenceOwners.get(ownerKey) === context.token) preferenceOwners.delete(ownerKey);
      });
      void queryClient.invalidateQueries({
        queryKey: notificationKeys.preferences(context.userId),
      });
    },
  });
  const mutateAsync = mutation.mutateAsync;
  const updatePreferences = useCallback(
    (updates: Partial<PushNotificationPrefs>) => mutateAsync({ userId, updates }),
    [mutateAsync, userId],
  );

  return {
    ...query,
    prefs: query.data ?? null,
    updatePreferences,
    isSaving: mutation.isPending,
  };
}
