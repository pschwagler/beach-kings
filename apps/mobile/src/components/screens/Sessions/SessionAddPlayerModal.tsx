import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { PlayerSearchItem } from '@beach-kings/shared';
import TopNav from '@/components/ui/TopNav';
import Avatar from '@/components/ui/Avatar';
import useDebounce from '@/hooks/useDebounce';
import {
  sessionMutationOptions,
  sessionQueries,
} from '@/features/sessions';
import { useAuth } from '@/contexts/AuthContext';
import { usePaletteColors } from '@/theme/usePaletteColors';

interface Props {
  readonly sessionId: number;
  readonly leagueId?: number | null;
  readonly existingPlayerIds: ReadonlySet<number>;
  readonly onClose: () => void;
  readonly onAdded: () => void;
}

function getAddPlayerError(error: unknown): string {
  const response = (
    error as {
      response?: { status?: number; data?: { detail?: unknown } };
    }
  )?.response;
  const detail =
    typeof response?.data?.detail === 'string'
      ? response.data.detail.toLowerCase()
      : '';

  if (response == null) return 'Check your connection and try again.';
  if (detail.includes('already')) return 'This player is already in the session.';
  if (detail.includes('full')) return 'This session is full.';
  if (response.status === 403) {
    return "You don't have permission to add players to this session.";
  }
  return "We couldn't add this player. Please try again.";
}

export default function SessionAddPlayerModal({
  sessionId,
  leagueId = null,
  existingPlayerIds,
  onClose,
  onAdded,
}: Props): React.ReactNode {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const palette = usePaletteColors();
  const [search, setSearch] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const debouncedSearch = useDebounce(search, 250);

  const playersQuery = useQuery(
    sessionQueries.playerSearch(
      userId,
      sessionId,
      debouncedSearch,
      leagueId,
    ),
  );

  const addPlayer = useMutation({
    ...sessionMutationOptions.invitePlayer(sessionId),
    onMutate: () => {
      setAddError(null);
    },
    onSuccess: () => {
      onAdded();
    },
    onError: (error) => {
      setAddError(getAddPlayerError(error));
    },
  });

  const players = useMemo(
    () =>
      (playersQuery.data?.items ?? []).filter(
        (player) =>
          !player.in_session && !existingPlayerIds.has(player.id),
      ),
    [existingPlayerIds, playersQuery.data?.items],
  );

  const renderPlayer = ({
    item,
  }: {
    readonly item: PlayerSearchItem;
  }): React.JSX.Element => {
    const isAdding =
      addPlayer.isPending && addPlayer.variables === item.id;
    return (
      <TouchableOpacity
        testID={`roster-player-option-${item.id}`}
        onPress={() => addPlayer.mutate(item.id)}
        disabled={addPlayer.isPending}
        accessibilityRole="button"
        accessibilityLabel={`Add ${item.full_name ?? `${item.first_name} ${item.last_name}`}`}
        className="mx-4 mb-2 min-h-touch flex-row items-center rounded-[12px] border border-divider bg-surface px-3 py-3"
      >
        <Avatar
          imageUrl={item.profile_picture_url}
          name={item.full_name ?? `${item.first_name} ${item.last_name}`}
          size="md"
          colorSeed={item.id}
          className="mr-3"
          accessible={false}
        />
        <Text className="flex-1 text-[15px] font-semibold text-default">
          {item.full_name ?? `${item.first_name} ${item.last_name}`}
        </Text>
        {isAdding ? (
          <ActivityIndicator size="small" color={palette.brandTeal} />
        ) : (
          <Text className="text-[13px] font-bold text-brand-teal">Add</Text>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      testID="roster-add-player-modal"
    >
      <SafeAreaView className="flex-1 bg-page" edges={['top']}>
        <TopNav
          title="Add Player"
          leftAction={
            <TouchableOpacity
              testID="roster-player-picker-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close player picker"
              className="min-h-touch min-w-touch items-center justify-center"
            >
              <Text className="text-[16px] text-inverse">Cancel</Text>
            </TouchableOpacity>
          }
        />
        <View className="border-b border-divider bg-surface px-4 py-3">
          <TextInput
            testID="roster-player-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search players"
            placeholderTextColor={palette.textTertiary}
            accessibilityLabel="Search players"
            autoCapitalize="none"
            autoCorrect={false}
            className="h-11 rounded-[10px] bg-elevated px-3 text-[15px] text-default"
          />
        </View>

        {addError != null && (
          <Text
            testID="roster-add-player-error"
            accessibilityRole="alert"
            className="mx-4 mt-3 rounded-[10px] bg-danger-tint px-3 py-3 text-[13px] font-semibold text-danger"
          >
            {addError}
          </Text>
        )}

        {playersQuery.isLoading ? (
          <View
            testID="roster-player-search-loading"
            className="flex-1 items-center justify-center"
          >
            <ActivityIndicator color={palette.brandTeal} />
          </View>
        ) : playersQuery.isError ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-center text-[14px] text-muted">
              We couldn't load players. Check your connection and try again.
            </Text>
            <TouchableOpacity
              testID="roster-player-search-retry"
              onPress={() => void playersQuery.refetch()}
              accessibilityRole="button"
              accessibilityLabel="Try loading players again"
              className="mt-4 min-h-touch justify-center"
            >
              <Text className="text-[14px] font-bold text-brand-teal">
                Try Again
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            testID="roster-player-options"
            data={players}
            keyExtractor={(player) => String(player.id)}
            renderItem={renderPlayer}
            contentContainerStyle={{
              paddingTop: 12,
              paddingBottom: 32,
              flexGrow: players.length === 0 ? 1 : undefined,
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center px-8">
                <Text className="text-center text-[14px] text-muted">
                  {search.trim() === ''
                    ? 'No more players are available to add.'
                    : 'No players match your search.'}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </Modal>
  );
}
