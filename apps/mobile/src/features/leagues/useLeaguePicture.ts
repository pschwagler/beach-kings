import { useCallback, useEffect, useRef } from 'react';
import { onlineManager, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { api } from '@/lib/api';
import { leagueQueries } from './queries';
import { leagueKeys } from './keys';

export type LeaguePictureFile = { uri: string; name: string; type: string };
type PictureChange = { kind: 'upload'; file: LeaguePictureFile } | { kind: 'remove' };
type PictureOwner = { userId: number; leagueId: number; canEdit: boolean; active: boolean; pending: boolean };

/** Mount only inside a member's league; image bytes stay in this private, ephemeral query. */
export function useLeaguePicture(userId: number, leagueId: number, canEdit: boolean) {
  const client = useQueryClient();
  const key = leagueKeys.picture(userId, leagueId);
  const query = useQuery(leagueQueries.picture(userId, leagueId));
  const owner = useRef<PictureOwner>({ userId, leagueId, canEdit, active: true, pending: false });
  if (owner.current.userId !== userId || owner.current.leagueId !== leagueId
    || owner.current.canEdit !== canEdit) {
    owner.current.active = false;
    owner.current = { userId, leagueId, canEdit, active: true, pending: false };
  }
  useEffect(() => {
    const scope = owner.current;
    scope.active = true;
    return () => { scope.active = false; };
  }, [userId, leagueId, canEdit]);
  useFocusEffect(useCallback(() => {
    // Navigation focus also rechecks membership after another admin removes it.
    void client.invalidateQueries({ queryKey: leagueKeys.picture(userId, leagueId), exact: true });
  }, [client, userId, leagueId]));

  const mutation = useMutation({
    networkMode: 'always',
    retry: false,
    scope: { id: `league-picture:${userId}:${leagueId}` },
    mutationFn: async ({ change, scope }: { change: PictureChange; scope: PictureOwner }) => {
      if (!scope.active || scope !== owner.current || !scope.canEdit || scope.userId <= 0
        || scope.userId !== userId || scope.leagueId !== leagueId) throw new Error('League admin access required.');
      if (!onlineManager.isOnline()) throw new Error('Reconnect to update the league picture.');
      return change.kind === 'upload'
        ? api.uploadLeaguePicture(leagueId, change.file)
        : api.removeLeaguePicture(leagueId);
    },
    onMutate: async ({ scope }) => {
      if (!scope.active || scope !== owner.current) throw new Error('League access changed.');
      const existing = client.getQueryCache().find({ queryKey: key, exact: true });
      await client.cancelQueries({ queryKey: key, exact: true });
      return { scope, existing };
    },
    onSuccess: async (picture, _change, context) => {
      const isCurrent = () => context?.scope.active && context.scope === owner.current && context.existing
        && client.getQueryCache().find({ queryKey: key, exact: true }) === context.existing;
      if (!isCurrent()) return;
      // Focus/reconnect may have started another read during the upload. It
      // must not overwrite confirmed new bytes with a pre-upload snapshot.
      await client.cancelQueries({ queryKey: key, exact: true });
      if (!isCurrent()) return;
      client.setQueryData(key, picture);
    },
  });
  const currentOwner = owner.current;
  const changePicture = async (change: PictureChange): Promise<void> => {
    if (!currentOwner.active || currentOwner !== owner.current || !currentOwner.canEdit) {
      throw new Error('League admin access required.');
    }
    if (currentOwner.pending) return;
    currentOwner.pending = true;
    try { await mutation.mutateAsync({ change, scope: currentOwner }); }
    finally { currentOwner.pending = false; }
  };
  // Mutation observers retain their previous variables across option changes.
  // Never offer another account/league's file as this screen's retry action.
  const isCurrentMutation = mutation.variables?.scope === currentOwner && currentOwner.active;
  return { query, changePicture, mutation: {
    isPending: isCurrentMutation && mutation.isPending,
    isPaused: isCurrentMutation && mutation.isPaused,
    isError: isCurrentMutation && mutation.isError,
    error: isCurrentMutation ? mutation.error : null,
    variables: isCurrentMutation ? mutation.variables : undefined,
  } };
}
