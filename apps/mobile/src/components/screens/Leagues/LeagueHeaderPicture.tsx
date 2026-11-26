import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import type { LeaguePicture } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import TopNav from '@/components/ui/TopNav';
import LeagueAvatar from './LeagueAvatar';

interface Props {
  readonly leagueId: number;
  readonly name: string;
  readonly picture?: LeaguePicture;
}

export default function LeagueHeaderPicture({ leagueId, name, picture }: Props) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const close = () => setOpen(false);
  const uri = picture?.data_uri;

  if (!uri) return <LeagueAvatar leagueId={leagueId} />;

  return (
    <>
      <Pressable
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
      {open && (
        <Modal visible animationType="fade" onRequestClose={close}>
          <SafeAreaView className="flex-1 bg-page" accessibilityViewIsModal>
            <TopNav title="League picture" rightAction={
              <Pressable accessibilityRole="button" accessibilityLabel="Close league picture"
                onPress={close} className="min-h-touch min-w-touch justify-center">
                <AppText className="text-inverse font-semibold">Close</AppText>
              </Pressable>
            } />
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
          </SafeAreaView>
        </Modal>
      )}
    </>
  );
}
