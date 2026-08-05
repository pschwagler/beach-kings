import { useCallback } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { Player } from '@beach-kings/shared';
import { usePlayerProfileMutations } from '@/features/player';
import { useToast } from '@/contexts/ToastContext';
import { getApiErrorMessage } from '@/lib/apiError';
import { hapticSuccess } from '@/utils/haptics';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export function useProfilePhotoActions(player: Player | null) {
  const { uploadAvatar, deleteAvatar } = usePlayerProfileMutations();
  const { showToast } = useToast();
  const busy = uploadAvatar.isPending || deleteAvatar.isPending;

  const choosePhoto = useCallback(async () => {
    if (player == null || busy) return;
    let result: ImagePicker.ImagePickerResult;
    try {
      // On iOS the system picker grants access only to the selected asset, so
      // requesting broad Photo Library access first is unnecessary.
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.9,
      });
    } catch {
      showToast('The photo library could not be opened. Please try again.', 'error');
      return;
    }
    if (result.canceled) return;
    const asset = result.assets[0];
    if (asset == null) {
      showToast('The selected photo could not be read.', 'error');
      return;
    }
    if (asset.fileSize != null && asset.fileSize > MAX_AVATAR_BYTES) {
      showToast('Choose a photo smaller than 5 MB.', 'error');
      return;
    }

    try {
      await uploadAvatar.mutateAsync({
        uri: asset.uri,
        name: asset.fileName ?? `profile-${player.id}.jpg`,
        type: asset.mimeType ?? 'image/jpeg',
      });
      void hapticSuccess();
      showToast('Profile photo updated.', 'success');
    } catch (error) {
      showToast(
        getApiErrorMessage(error, 'Your profile photo could not be uploaded.'),
        'error',
      );
    }
  }, [busy, player, showToast, uploadAvatar]);

  const removePhoto = useCallback(async () => {
    if (busy) return;
    try {
      await deleteAvatar.mutateAsync();
      void hapticSuccess();
      showToast('Profile photo removed.', 'success');
    } catch (error) {
      showToast(
        getApiErrorMessage(error, 'Your profile photo could not be removed.'),
        'error',
      );
    }
  }, [busy, deleteAvatar, showToast]);

  const onPhotoPress = useCallback(() => {
    if (player == null || busy) return;
    const hasPhoto = Boolean(player.profile_picture_url?.trim());
    if (!hasPhoto) {
      void choosePhoto();
      return;
    }
    Alert.alert('Profile Photo', undefined, [
      { text: 'Choose New Photo', onPress: () => { void choosePhoto(); } },
      {
        text: 'Remove Photo',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Remove profile photo?',
            'Your initials will be shown instead.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => { void removePhoto(); } },
            ],
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [busy, choosePhoto, player, removePhoto]);

  return { onPhotoPress, busy };
}
