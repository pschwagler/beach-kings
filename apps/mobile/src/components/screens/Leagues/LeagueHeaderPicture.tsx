import { useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { LeaguePicture } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import Modal from '@/components/ui/Modal';
import LeagueAvatar from './LeagueAvatar';

interface Props {
  readonly leagueId: number;
  readonly name: string;
  readonly picture?: LeaguePicture;
}

export default function LeagueHeaderPicture({ leagueId, name, picture }: Props) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const avatarRef = useRef<View>(null);
  const uri = picture?.data_uri;

  if (!uri) return <LeagueAvatar leagueId={leagueId} />;

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
        className="active:opacity-70"
      >
        <LeagueAvatar leagueId={leagueId} picture={picture} />
      </Pressable>
      <Modal
        visible={open}
        onClose={() => setOpen(false)}
        title="League picture"
        returnFocusRef={avatarRef}
      >
        <View className="flex-1 items-center justify-center">
          {failed ? (
            <AppText className="text-muted">Could not display the league picture.</AppText>
          ) : (
            <Image
              testID="league-picture-preview"
              accessibilityLabel={`${name} league picture`}
              accessible
              source={{ uri }}
              contentFit="contain"
              cachePolicy="none"
              style={StyleSheet.absoluteFill}
              onError={() => setFailed(true)}
            />
          )}
        </View>
      </Modal>
    </>
  );
}
