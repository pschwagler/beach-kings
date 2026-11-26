import { useRef, useState } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { ArrowsOut } from 'phosphor-react-native';
import type { LeaguePicture } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import BottomSheet from '@/components/ui/BottomSheet';
import { XIcon } from '@/components/ui/icons';
import { usePaletteColors } from '@/theme/usePaletteColors';
import LeagueAvatar from './LeagueAvatar';

interface Props {
  readonly leagueId: number;
  readonly name: string;
  readonly picture?: LeaguePicture;
}

const PREVIEW_GUTTER = 16;

export default function LeagueHeaderPicture({ leagueId, name, picture }: Props) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(1);
  const avatarRef = useRef<View>(null);
  const palette = usePaletteColors();
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const uri = picture?.data_uri;

  if (!uri) return <LeagueAvatar leagueId={leagueId} />;

  const availableWidth = window.width - insets.left - insets.right - 2 * PREVIEW_GUTTER;
  const previewHeight = Math.min(availableWidth / aspectRatio, window.height * 0.6);
  const closePreview = () => setOpen(false);

  return (
    <>
      <Pressable
        ref={avatarRef}
        accessibilityRole="button"
        accessibilityLabel={`View picture for ${name}`}
        onPress={() => {
          setFailed(false);
          setOpen(true);
        }}
        className="relative shrink-0 active:opacity-70"
      >
        <LeagueAvatar leagueId={leagueId} picture={picture} />
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          className="absolute -bottom-1 -right-1 size-5 items-center justify-center rounded-full border border-divider bg-surface"
        >
          <ArrowsOut size={11} color={palette.brandTeal} weight="bold" />
        </View>
      </Pressable>
      <BottomSheet
        visible={open}
        onClose={closePreview}
        accessibilityLabel="League picture"
        returnFocusRef={avatarRef}
        keyboardAvoidanceEnabled={false}
      >
        <SafeAreaView edges={['left', 'right', 'bottom']}>
          <View className="flex-row items-center justify-between gap-2 px-4">
            <AppText accessibilityRole="header" className="flex-1 text-lg font-bold text-default">
              League picture
            </AppText>
            <Pressable
              onPress={closePreview}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="min-h-touch min-w-touch items-center justify-center"
            >
              <XIcon size={18} color={palette.textMuted} />
            </Pressable>
          </View>
          <View style={{ paddingHorizontal: PREVIEW_GUTTER }} className="pb-4">
            {failed ? (
              <AppText className="py-4 text-center text-muted">Could not display the league picture.</AppText>
            ) : (
              <Image
                testID="league-picture-preview"
                accessibilityLabel={`${name} league picture`}
                accessible
                source={{ uri }}
                contentFit="contain"
                cachePolicy="none"
                style={{ width: '100%', height: previewHeight }}
                onLoad={({ source }) => {
                  if (source.width > 0 && source.height > 0) {
                    setAspectRatio(source.width / source.height);
                  }
                }}
                onError={() => setFailed(true)}
              />
            )}
          </View>
        </SafeAreaView>
      </BottomSheet>
    </>
  );
}
