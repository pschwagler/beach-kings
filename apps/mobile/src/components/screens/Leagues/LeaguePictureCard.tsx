import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import AppText from '@/components/ui/AppText';
import { useAuth } from '@/contexts/AuthContext';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { getApiErrorMessage } from '@/lib/apiError';
import { useLeaguePicture } from '@/features/leagues/useLeaguePicture';

interface Props {
  readonly leagueId: number;
  readonly leagueName: string;
  readonly canEdit: boolean;
}

/** This surface is never mounted for visitors or on discovery/list cards. */
export default function LeaguePictureCard({ leagueId, leagueName, canEdit }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const palette = usePaletteColors();
  const { query, mutation, changePicture } = useLeaguePicture(userId, leagueId, canEdit);
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const scope = useRef({ userId, leagueId, canEdit, active: true, choosing: false });
  if (scope.current.userId !== userId || scope.current.leagueId !== leagueId
    || scope.current.canEdit !== canEdit) {
    scope.current.active = false;
    scope.current = { userId, leagueId, canEdit, active: true, choosing: false };
  }
  useEffect(() => {
    const current = scope.current;
    current.active = true;
    setChoosing(false);
    setPickerError(null);
    return () => { current.active = false; };
  }, [userId, leagueId, canEdit]);

  const busy = choosing || mutation.isPending;
  const picture = query.isError ? null : query.data?.data_uri;
  const error = pickerError ?? (mutation.error
    ? getApiErrorMessage(mutation.error, 'The league picture could not be updated.') : null);
  const choose = async () => {
    const current = scope.current;
    if (!canEdit || !current.active || current.choosing || mutation.isPending) return;
    current.choosing = true;
    setChoosing(true);
    setPickerError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.85,
      });
      if (!current.active || current !== scope.current || result.canceled) return;
      const asset = result.assets[0];
      if (!asset) throw new Error('The selected photo could not be read.');
      if (asset.fileSize != null && asset.fileSize > 5 * 1024 * 1024) {
        throw new Error('Choose a photo smaller than 5 MB.');
      }
      await changePicture({ kind: 'upload', file: {
        uri: asset.uri, name: asset.fileName ?? 'league-picture.jpg', type: asset.mimeType ?? 'image/jpeg',
      } });
    } catch (failure) {
      if (current.active && current === scope.current) {
        setPickerError(getApiErrorMessage(failure, 'The photo library could not be opened.'));
      }
    } finally {
      current.choosing = false;
      if (current.active && current === scope.current) setChoosing(false);
    }
  };
  const remove = () => {
    const requestedBy = scope.current;
    Alert.alert('Remove league picture?', 'Members will see the league name without a picture.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Remove', style: 'destructive', onPress: () => {
      if (!requestedBy.active || requestedBy !== scope.current || !requestedBy.canEdit || mutation.isPending) return;
      setPickerError(null);
      void changePicture({ kind: 'remove' }).catch(() => undefined);
    } },
    ]);
  };

  if (!picture && !canEdit && !query.isError) return null;
  return (
    <View testID="league-picture-card" className="mb-2">
      {picture != null && <Image testID="league-picture" source={{ uri: picture }} cachePolicy="none"
        recyclingKey={`${userId}:${leagueId}:${query.data?.revision}`}
        contentFit="contain" accessibilityLabel={`${leagueName} league picture`}
        style={{ width: '100%', height: 112, borderRadius: 12, marginBottom: 4, backgroundColor: palette.bgInset }} />}
      {canEdit && <View className="flex-row items-center gap-4">
        <Pressable testID="league-picture-upload" accessibilityRole="button"
          accessibilityLabel={picture ? 'Change league picture' : 'Add league picture'}
          accessibilityState={{ disabled: busy || query.isPending, busy }} disabled={busy || query.isPending}
          onPress={() => { void choose(); }} className="min-h-touch flex-row items-center gap-2 active:opacity-70">
          {busy && <ActivityIndicator size="small" color={palette.brandTeal} />}
          <AppText className="text-[13px] font-semibold text-brand-teal">
            {busy ? 'Updating picture…' : picture ? 'Change picture' : 'Add league picture'}
          </AppText>
        </Pressable>
        {picture != null && <Pressable testID="league-picture-remove" accessibilityRole="button"
          accessibilityLabel="Remove league picture" disabled={busy} onPress={remove}
          className="min-h-touch justify-center active:opacity-70">
          <AppText className="text-[13px] font-semibold text-muted">Remove</AppText>
        </Pressable>}
      </View>}
      {error != null && <AppText accessibilityRole="alert" className="text-[13px] text-danger">{error}</AppText>}
      {query.isError && <Pressable accessibilityRole="button" accessibilityLabel="Retry league picture"
        onPress={() => { void query.refetch(); }} className="min-h-touch justify-center">
        <AppText className="text-[13px] text-muted">Could not load the league picture. Tap to retry.</AppText>
      </Pressable>}
      {mutation.isError && mutation.variables != null && <Pressable accessibilityRole="button"
        accessibilityLabel="Retry picture update" disabled={busy} className="min-h-touch justify-center"
        onPress={() => {
          setPickerError(null);
          void changePicture(mutation.variables!.change).catch(() => undefined);
        }}>
        <AppText className="text-[13px] font-semibold text-brand-teal">Retry</AppText>
      </Pressable>}
    </View>
  );
}
