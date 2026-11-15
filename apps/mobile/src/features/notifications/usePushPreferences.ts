import { useCallback, useRef } from 'react';
import { type QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PushNotificationPrefs } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { notificationKeys } from './keys';
import { notificationQueries } from './queries';
import { withNotificationMutationDeadline } from './mutationDeadline';

let preferenceMutationSequence = 0;
interface PreferenceOwner { token: number; updateCount: number | undefined; query: object | undefined }
const ownersByClient = new WeakMap<QueryClient, Map<string, PreferenceOwner>>();

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
  let preferenceOwners = ownersByClient.get(queryClient);
  if (preferenceOwners == null) {
    preferenceOwners = new Map();
    ownersByClient.set(queryClient, preferenceOwners);
  }
  const owners = preferenceOwners;
  const queryIdentity = (id: number) => queryClient.getQueryCache().find({ queryKey: notificationKeys.preferences(id), exact: true });
  const version = (id: number) => queryClient.getQueryState(notificationKeys.preferences(id))?.dataUpdateCount;
  // Our own writes preserve ownership of other pending fields. A refetch or
  // external cache write advances the version without carrying ownership over.
  const advanceOwners = (id: number, before: number | undefined) => {
    for (const [key, owner] of owners) {
      if (key.startsWith(`${id}:`) && owner.updateCount === before && owner.query === queryIdentity(id)) owner.updateCount = version(id);
    }
  };
  const applyOwned = (context: { userId: number; token: number; updateKeys: Array<keyof PushNotificationPrefs> }, prefs: PushNotificationPrefs) => {
    const before = version(context.userId);
    const keys = context.updateKeys.filter((key) => {
      const owner = owners.get(preferenceOwnerKey(context.userId, key));
      return owner?.token === context.token && owner.updateCount === before && owner.query === queryIdentity(context.userId);
    });
    if (keys.length === 0) return;
    queryClient.setQueryData<PushNotificationPrefs>(notificationKeys.preferences(context.userId), (current) => {
      if (current == null) return current;
      const next = { ...current };
      keys.forEach((key) => { next[key] = prefs[key]; });
      return next;
    });
    advanceOwners(context.userId, before);
  };
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
      const before = version(mutationUserId);
      if (previous != null) queryClient.setQueryData(key, { ...previous, ...updates });
      advanceOwners(mutationUserId, before);
      updateKeys.forEach((updateKey) => {
        owners.set(preferenceOwnerKey(mutationUserId, updateKey), { token, updateCount: version(mutationUserId), query: queryIdentity(mutationUserId) });
      });
      return { previous, token, updateKeys, userId: mutationUserId, query: queryIdentity(mutationUserId) };
    },
    onError: (_error, _updates, context) => {
      if (context?.previous != null) applyOwned(context, context.previous);
    },
    onSuccess: (prefs, _updates, context) => {
      if (context != null) applyOwned(context, prefs);
    },
    onSettled: (_data, _error, _updates, context) => {
      if (context == null) return;
      context.updateKeys.forEach((updateKey) => {
        const ownerKey = preferenceOwnerKey(context.userId, updateKey);
        if (owners.get(ownerKey)?.token === context.token) owners.delete(ownerKey);
      });
      if (queryIdentity(context.userId) !== context.query) return;
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
