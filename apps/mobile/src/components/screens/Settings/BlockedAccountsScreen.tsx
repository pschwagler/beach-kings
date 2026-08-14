import React, { useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import type { BlockedPlayer } from '@beach-kings/shared';
import AppText from '@/components/ui/AppText';
import Avatar from '@/components/ui/Avatar';
import TopNav from '@/components/ui/TopNav';
import { useAuth } from '@/contexts/AuthContext';
import { moderationQueries, useModerationMutations } from '@/features/moderation';
import UnblockPlayerDialog from '@/components/moderation/UnblockPlayerDialog';
import { usePaletteColors } from '@/theme/usePaletteColors';

export default function BlockedAccountsScreen(): React.ReactNode {
  const { user } = useAuth();
  const palette = usePaletteColors();
  const query = useQuery(moderationQueries.blocks(user?.id ?? 0));
  const { unblock } = useModerationMutations();
  const [selected, setSelected] = useState<BlockedPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmUnblock = () => {
    if (selected == null) return;
    setError(null);
    void unblock.mutateAsync(selected.player_id).then(() => {
      AccessibilityInfo.announceForAccessibility(`${selected.full_name} unblocked.`);
      setSelected(null);
    }).catch(() => setError('Could not unblock this player. Please try again.'));
  };

  const renderRow = ({ item }: { item: BlockedPlayer }) => (
    <View className="min-h-[68px] flex-row items-center px-lg border-b border-divider bg-surface">
      <Avatar imageUrl={item.avatar} name={item.full_name} size={40} colorSeed={item.player_id} />
      <AppText className="flex-1 ml-md text-base font-semibold text-default" numberOfLines={1}>{item.full_name}</AppText>
      <Pressable
        onPress={() => {
          setError(null);
          setSelected(item);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Unblock ${item.full_name}`}
        className="min-h-touch px-md items-center justify-center rounded-xl border border-brand-teal"
      >
        <AppText className="text-brand-teal font-bold">Unblock</AppText>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView className="flex-1 bg-page" edges={['top']}>
      <TopNav title="Blocked Accounts" showBack />
      {query.isLoading ? (
        <View className="flex-1 items-center justify-center"><ActivityIndicator color={palette.brandTeal} /></View>
      ) : query.isError ? (
        <View className="flex-1 items-center justify-center px-xl">
          <AppText className="text-default font-bold">Could not load blocked accounts.</AppText>
          <Pressable onPress={() => { void query.refetch(); }} className="min-h-touch justify-center mt-sm">
            <AppText className="text-brand-teal font-bold">Try again</AppText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(item) => String(item.player_id)}
          renderItem={renderRow}
          ListHeaderComponent={(
            <View className="px-lg py-md bg-elevated border-b border-divider">
              <AppText className="text-sm text-muted leading-5">
                Blocked players can't contact, find, befriend, or invite you. Shared league results and schedules stay visible.
              </AppText>
            </View>
          )}
          ListEmptyComponent={(
            <View className="items-center px-xl py-3xl">
              <AppText className="text-lg font-bold text-default">No blocked accounts</AppText>
              <AppText className="text-sm text-muted text-center mt-sm">Players you block will appear here.</AppText>
            </View>
          )}
        />
      )}
      <UnblockPlayerDialog
        visible={selected != null}
        playerName={selected?.full_name ?? 'this player'}
        isPending={unblock.isPending}
        errorMessage={error}
        onConfirm={confirmUnblock}
        onCancel={() => setSelected(null)}
      />
    </SafeAreaView>
  );
}
