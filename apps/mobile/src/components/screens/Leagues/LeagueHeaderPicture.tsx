import { useRef, useState, type ComponentProps } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowsOut } from 'phosphor-react-native';
import type { LeaguePicture } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import BottomSheet from '@/components/ui/BottomSheet';
import { CameraIcon, XIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import LeagueAvatar from './LeagueAvatar';
import LeaguePictureActions from './LeaguePictureActions';

interface Props {
  readonly leagueId: number;
  readonly name: string;
  readonly picture?: LeaguePicture;
  readonly canEdit: boolean;
  readonly management: ComponentProps<typeof LeaguePictureActions>['management'];
}

function LeaguePhotoPreview({ name, uri }: { readonly name: string; readonly uri: string }) {
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const availableWidth = window.width - insets.left - insets.right - 32;

  if (failed) {
    return <AppText className="py-4 text-center text-muted">Could not display the league photo.</AppText>;
  }
  return (
    <Image
      testID="league-picture-preview"
      accessibilityLabel={`${name} league photo`}
      accessible
      source={{ uri }}
      contentFit="contain"
      cachePolicy="none"
      style={{ width: '100%', height: Math.min(availableWidth / aspectRatio, window.height * 0.55) }}
      onLoad={({ source }) => {
        if (source.width > 0 && source.height > 0) setAspectRatio(source.width / source.height);
      }}
      onError={() => setFailed(true)}
    />
  );
}

export default function LeagueHeaderPicture({ leagueId, name, picture, canEdit, management }: Props) {
  const [open, setOpen] = useState(false);
  const avatarRef = useRef<View>(null);
  const palette = usePaletteColors();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const uri = picture?.data_uri;
  const { isPending, isError } = management.query;

  if (!uri && !canEdit && !isError) return <LeagueAvatar leagueId={leagueId} />;

  const isEmpty = !uri && !isPending && !isError;
  const title = isEmpty ? 'Add league photo' : 'League photo';
  const actionName = isEmpty ? 'Add photo for' : uri ? 'View photo for' : 'Open photo for';
  const close = () => setOpen(false);

  return (
    <>
      <Pressable
        ref={avatarRef}
        accessibilityRole="button"
        accessibilityLabel={`${actionName} ${name}`}
        accessibilityHint={uri && canEdit ? 'Opens the preview and photo settings' : undefined}
        onPress={() => setOpen(true)}
        className="relative shrink-0 active:opacity-70"
      >
        <LeagueAvatar leagueId={leagueId} picture={picture} />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          className="absolute -bottom-1 -right-1 size-5 items-center justify-center rounded-full border border-divider bg-surface"
        >
          {!uri && canEdit ? <CameraIcon size={12} color={palette.brandTeal} />
            : <ArrowsOut size={11} color={palette.brandTeal} weight="bold" />}
        </View>
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={close}
        accessibilityLabel={title}
        returnFocusRef={avatarRef}
        keyboardAvoidanceEnabled={false}
        style={{ maxHeight: window.height - insets.top - 16 }}
      >
        <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flexShrink: 1 }}>
          <View className="flex-row items-center justify-between gap-2 px-4">
            <AppText accessibilityRole="header" className="flex-1 text-lg font-bold text-default">
              {title}
            </AppText>
            <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="Close"
              className="min-h-touch min-w-touch items-center justify-center">
              <XIcon size={18} color={palette.textMuted} />
            </Pressable>
          </View>
          <ScrollView contentContainerClassName="gap-md px-4 pb-4" bounces={false}>
            {uri && <LeaguePhotoPreview key={picture?.revision} uri={uri} name={name} />}
            {isEmpty && (
              <View className="items-center gap-sm rounded-xl bg-page px-4 py-5">
                <LeagueAvatar leagueId={leagueId} />
                <AppText className="text-center text-subhead text-muted">League members can see this photo.</AppText>
              </View>
            )}
            <LeaguePictureActions leagueId={leagueId} canEdit={canEdit} management={management} />
          </ScrollView>
        </SafeAreaView>
      </BottomSheet>
    </>
  );
}
