import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import AppText from '@/components/ui/AppText';
import { useAuth } from '@/contexts/AuthContext';
import { usePaletteColors } from '@/theme/usePaletteColors';
import { getApiErrorMessage } from '@/lib/apiError';
import type { useLeaguePicture } from '@/features/leagues/useLeaguePicture';

type Management = ReturnType<typeof useLeaguePicture>;

interface Props {
  readonly leagueId: number;
  readonly canEdit: boolean;
  readonly management: {
    readonly query: Pick<Management['query'], 'data' | 'isPending' | 'isError' | 'refetch'>;
    readonly mutation: Pick<Management['mutation'], 'isPending' | 'isError' | 'error' | 'variables'>;
    readonly changePicture: Management['changePicture'];
  };
}

/** Picture actions and read recovery inside the league header sheet. */
export default function LeaguePictureActions({ leagueId, canEdit, management }: Props) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const palette = usePaletteColors();
  const { query, mutation, changePicture } = management;
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
        mediaTypes: ['images'],
        allowsEditing: false,
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
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
    Alert.alert('Remove league photo?', 'The league will show its default icon.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => {
        if (!requestedBy.active || requestedBy !== scope.current || !requestedBy.canEdit || mutation.isPending) return;
        setPickerError(null);
        void changePicture({ kind: 'remove' }).catch(() => undefined);
      } },
    ]);
  };

  if (!canEdit && !query.isError) return null;
  if (query.isPending) {
    return <AppText className="py-4 text-center text-muted">Loading photo…</AppText>;
  }
  if (query.isError) {
    return (
      <Pressable accessibilityRole="button" onPress={() => { void query.refetch(); }}
        className="min-h-touch justify-center">
        <AppText className="text-center text-brand-teal">Retry loading photo</AppText>
      </Pressable>
    );
  }

  return (
    <View testID="league-picture-actions" className="gap-sm">
      <Pressable testID="league-picture-upload" accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }} disabled={busy}
        onPress={() => { void choose(); }}
        className="min-h-touch flex-row items-center justify-center gap-2 rounded-button bg-brand-teal px-md py-sm active:opacity-80 disabled:opacity-60">
        {busy && <ActivityIndicator size="small" color={palette.textInverse} />}
        <AppText className="shrink text-center text-subhead font-semibold text-inverse">
          {busy ? 'Updating photo…' : picture ? 'Replace photo' : 'Choose photo'}
        </AppText>
      </Pressable>
      {picture != null && <Pressable testID="league-picture-remove" accessibilityRole="button"
        disabled={busy} onPress={remove} className="min-h-touch items-center justify-center active:opacity-70">
        <AppText className="text-subhead font-semibold text-danger">Remove photo</AppText>
      </Pressable>}
      {error != null && <AppText accessibilityRole="alert" className="text-[13px] text-danger">{error}</AppText>}
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
