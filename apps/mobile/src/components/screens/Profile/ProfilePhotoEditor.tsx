import React, { useCallback } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import type { Player } from '@beach-kings/shared';
import Avatar from '@/components/ui/Avatar';
import type { NativeImageFile } from '@/features/player';

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

interface ProfilePhotoEditorProps {
  readonly player: Player;
  readonly busy: boolean;
  readonly onUpload: (file: NativeImageFile) => Promise<void>;
  readonly onDelete: () => Promise<void>;
  readonly onError: (message: string) => void;
}

export default function ProfilePhotoEditor({
  player,
  busy,
  onUpload,
  onDelete,
  onError,
}: ProfilePhotoEditorProps): React.ReactNode {
  const name = player.full_name ?? player.name;
  const hasPhoto =
    typeof player.profile_picture_url === 'string'
    && player.profile_picture_url.length > 0;

  const choosePhoto = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      onError('Photo access is required to choose a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    if (asset == null) {
      onError('The selected photo could not be read.');
      return;
    }
    if (asset.fileSize != null && asset.fileSize > MAX_AVATAR_BYTES) {
      onError('Choose a photo smaller than 5 MB.');
      return;
    }

    await onUpload({
      uri: asset.uri,
      name: asset.fileName ?? `profile-${player.id}.jpg`,
      type: asset.mimeType ?? 'image/jpeg',
    });
  }, [onError, onUpload, player.id]);

  const confirmDelete = useCallback(() => {
    Alert.alert(
      'Remove profile photo?',
      'Your initials will be shown instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => { void onDelete(); },
        },
      ],
    );
  }, [onDelete]);

  return (
    <View className="items-center py-lg">
      <Avatar
        imageUrl={player.profile_picture_url}
        name={name}
        colorSeed={player.id}
        size="xl"
        testID="edit-profile-avatar"
      />
      <View className="flex-row items-center mt-sm">
        <Pressable
          onPress={() => { void choosePhoto(); }}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={hasPhoto ? 'Change profile photo' : 'Add profile photo'}
          accessibilityState={{ disabled: busy, busy }}
          className="min-h-touch px-md items-center justify-center"
        >
          <Text className="text-brand-teal font-semibold text-body">
            {hasPhoto ? 'Change Photo' : 'Add Photo'}
          </Text>
        </Pressable>
        {hasPhoto ? (
          <Pressable
            onPress={confirmDelete}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Remove profile photo"
            accessibilityState={{ disabled: busy, busy }}
            className="min-h-touch px-md items-center justify-center"
          >
            <Text className="text-danger font-semibold text-body">Remove</Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="text-caption text-muted text-center">
        JPEG, PNG, WebP, or HEIC · 5 MB maximum
      </Text>
    </View>
  );
}
