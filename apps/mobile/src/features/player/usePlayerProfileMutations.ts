import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Player } from '@beach-kings/shared';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { playerKeys } from './keys';

export interface NativeImageFile {
  readonly uri: string;
  readonly name: string;
  readonly type: string;
}

/**
 * Owns every current-player profile write and keeps the shared player query
 * coherent. Screens should not hand-edit query data or invent additional
 * profile cache keys.
 */
export function usePlayerProfileMutations() {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const queryClient = useQueryClient();
  const queryKey = playerKeys.me(userId);

  const refreshPlayer = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey });
  };

  const updateProfile = useMutation({
    mutationFn: (updates: Partial<Player>) => api.updatePlayerProfile(updates),
    onSuccess: (updated) => {
      queryClient.setQueryData<Player | null>(queryKey, (current) => (
        current == null ? updated : { ...current, ...updated }
      ));
    },
    onSettled: refreshPlayer,
  });

  const uploadAvatar = useMutation({
    mutationFn: (file: NativeImageFile) => api.uploadAvatar(file),
    onSuccess: ({ profile_picture_url }) => {
      queryClient.setQueryData<Player | null>(queryKey, (current) => (
        current == null
          ? current
          : {
              ...current,
              avatar: profile_picture_url,
              profile_picture_url,
            }
      ));
    },
    onSettled: refreshPlayer,
  });

  const deleteAvatar = useMutation({
    mutationFn: () => api.deleteAvatar(),
    onSuccess: () => {
      queryClient.setQueryData<Player | null>(queryKey, (current) => (
        current == null
          ? current
          : { ...current, avatar: null, profile_picture_url: null }
      ));
    },
    onSettled: refreshPlayer,
  });

  return {
    updateProfile,
    uploadAvatar,
    deleteAvatar,
  };
}
