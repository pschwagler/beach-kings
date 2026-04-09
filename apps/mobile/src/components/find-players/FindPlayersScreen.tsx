import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl, ActivityIndicator } from 'react-native';
import { YStack, XStack, Text, ScrollView, getTokens } from 'tamagui';
import { Search, UserPlus, Clock, ChevronLeft } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Input } from '../ui/Input';
import { api } from '../../services/api';

/**
 * Player item returned by GET /api/friends/discover
 */
interface DiscoverPlayer {
  id: number;
  full_name: string;
  nickname?: string;
  gender?: string;
  level?: string;
  location_name?: string;
  city?: string;
  state?: string;
  total_games: number;
  current_rating: number;
  mutual_friend_count: number;
  friend_status: string; // "friend" | "pending_outgoing" | "pending_incoming" | "none"
}

interface DiscoverResponse {
  items: DiscoverPlayer[];
  total_count: number;
  page: number;
  page_size: number;
}

const LEVEL_FILTERS = ['Open', 'AA', 'A', 'B', 'Beginner'] as const;

const SORT_OPTIONS = [
  { key: 'mutuals', label: 'Mutual Friends' },
  { key: 'games', label: 'Most Games' },
  { key: 'name', label: 'Name' },
  { key: 'rating', label: 'Rating' },
] as const;

/**
 * Find Players screen for discovering other players.
 * Default sort: mutual friends (descending).
 * Primary stat: games count. Rating shown as secondary badge.
 */
export default function FindPlayersScreen(): React.ReactNode {
  const router = useRouter();
  const tokens = getTokens();

  const oceanBlue = (tokens.color as any)?.oceanBlue?.val || '#4a90a4';
  const primaryDark = (tokens.color as any)?.primaryDark?.val || '#205e6f';

  const [players, setPlayers] = useState<DiscoverPlayer[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [activeLevel, setActiveLevel] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('mutuals');

  const [pendingActions, setPendingActions] = useState<Set<number>>(new Set());

  const PAGE_SIZE = 25;

  const fetchPlayers = useCallback(async (
    pageNum: number,
    append: boolean,
    opts?: { searchOverride?: string; levelOverride?: string | null; sortOverride?: string },
  ) => {
    const params: Record<string, any> = {
      page: pageNum,
      page_size: PAGE_SIZE,
      sort_by: opts?.sortOverride ?? sortBy,
      sort_dir: 'desc',
    };

    const searchVal = opts?.searchOverride ?? search;
    if (searchVal.trim()) {
      params.search = searchVal.trim();
    }

    const levelVal = opts?.levelOverride !== undefined ? opts.levelOverride : activeLevel;
    if (levelVal) {
      params.level = levelVal.toLowerCase();
    }

    try {
      const data: DiscoverResponse = await api.discoverPlayers(params);
      if (append) {
        setPlayers(prev => [...prev, ...data.items]);
      } else {
        setPlayers(data.items);
      }
      setTotalCount(data.total_count);
      setPage(pageNum);
    } catch (error: any) {
      console.error('[FindPlayers] Error fetching players:', error?.message || error);
    }
  }, [search, activeLevel, sortBy]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchPlayers(1, false);
      setLoading(false);
    };
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true);
      await fetchPlayers(1, false);
      setLoading(false);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPlayers(1, false);
    setRefreshing(false);
  }, [fetchPlayers]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || players.length >= totalCount) return;
    setLoadingMore(true);
    await fetchPlayers(page + 1, true);
    setLoadingMore(false);
  }, [loadingMore, players.length, totalCount, page, fetchPlayers]);

  const handleLevelFilter = useCallback(async (level: string) => {
    const newLevel = activeLevel === level ? null : level;
    setActiveLevel(newLevel);
    setLoading(true);
    await fetchPlayers(1, false, { levelOverride: newLevel });
    setLoading(false);
  }, [activeLevel, fetchPlayers]);

  const handleSortChange = useCallback(async (sort: string) => {
    if (sort === sortBy) return;
    setSortBy(sort);
    setLoading(true);
    await fetchPlayers(1, false, { sortOverride: sort });
    setLoading(false);
  }, [sortBy, fetchPlayers]);

  const handleAddFriend = useCallback(async (playerId: number) => {
    if (pendingActions.has(playerId)) return;
    setPendingActions(prev => new Set([...prev, playerId]));

    try {
      await api.axios.post('/api/friends/request', { receiver_player_id: playerId });
      // Optimistic update
      setPlayers(prev => prev.map(p =>
        p.id === playerId ? { ...p, friend_status: 'pending_outgoing' } : p
      ));
    } catch (error: any) {
      console.error('[FindPlayers] Error sending friend request:', error?.message || error);
    } finally {
      setPendingActions(prev => {
        const next = new Set(prev);
        next.delete(playerId);
        return next;
      });
    }
  }, [pendingActions]);

  const getAvatarColor = (name: string): string => {
    const colors = ['#7fb3c7', '#c8e6c9', '#e8d5b7', '#a8d8ea', '#d4a843', '#b39ddb'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const renderPlayerCard = useCallback(({ item }: { item: DiscoverPlayer }) => {
    const displayName = item.nickname || item.full_name;
    const initial = displayName.trim().charAt(0).toUpperCase();
    const locationText = item.location_name || [item.city, item.state].filter(Boolean).join(', ');

    return (
      <XStack
        padding="$3"
        paddingHorizontal="$4"
        backgroundColor="$background"
        borderBottomWidth={1}
        borderBottomColor="$borderLight"
        alignItems="center"
        gap="$3"
        pressStyle={{ opacity: 0.8 }}
      >
        {/* Avatar */}
        <YStack
          width={48}
          height={48}
          borderRadius="$round"
          backgroundColor={getAvatarColor(displayName)}
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <Text fontSize="$4" fontWeight="700" color="$textWhite">
            {initial}
          </Text>
        </YStack>

        {/* Info */}
        <YStack flex={1} gap="$1">
          <Text fontSize="$2" fontWeight="600" color="$textPrimary" numberOfLines={1}>
            {displayName}
          </Text>
          {locationText ? (
            <Text fontSize="$1" color="$textSecondary" numberOfLines={1}>
              {locationText}
            </Text>
          ) : null}
          <XStack gap="$2" flexWrap="wrap">
            {item.level ? (
              <XStack
                backgroundColor="$seafoamLight"
                paddingHorizontal="$2"
                paddingVertical={2}
                borderRadius="$sm"
              >
                <Text fontSize={10} fontWeight="600" color="$oceanBlue">
                  {item.level}
                </Text>
              </XStack>
            ) : null}
            {item.mutual_friend_count > 0 ? (
              <XStack
                backgroundColor="$backgroundLight"
                paddingHorizontal="$2"
                paddingVertical={2}
                borderRadius="$sm"
              >
                <Text fontSize={10} fontWeight="600" color="$textSecondary">
                  {item.mutual_friend_count} mutual
                </Text>
              </XStack>
            ) : null}
          </XStack>
        </YStack>

        {/* Right side: Games (primary) + Rating (secondary) + Action button */}
        <YStack alignItems="flex-end" gap="$1">
          <Text fontSize="$4" fontWeight="700" color={primaryDark}>
            {item.total_games}
          </Text>
          <Text fontSize={10} color="$textSecondary">
            games
          </Text>
          {item.current_rating > 0 ? (
            <Text fontSize={10} color="$textLight">
              {Math.round(item.current_rating)}
            </Text>
          ) : null}
          {item.friend_status === 'none' ? (
            <XStack
              onPress={() => handleAddFriend(item.id)}
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius="$xs"
              borderWidth={1.5}
              borderColor={primaryDark}
              minHeight={44}
              alignItems="center"
              justifyContent="center"
              pressStyle={{ opacity: 0.7 }}
              opacity={pendingActions.has(item.id) ? 0.5 : 1}
            >
              <UserPlus size={14} color={primaryDark} />
              <Text fontSize={11} fontWeight="600" color={primaryDark} marginLeft="$1">
                Add
              </Text>
            </XStack>
          ) : item.friend_status === 'pending_outgoing' ? (
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius="$xs"
              backgroundColor="$seafoamLight"
              minHeight={44}
              alignItems="center"
              justifyContent="center"
            >
              <Clock size={14} color={oceanBlue} />
              <Text fontSize={11} fontWeight="600" color={oceanBlue} marginLeft="$1">
                Pending
              </Text>
            </XStack>
          ) : item.friend_status === 'friend' ? (
            <XStack
              paddingHorizontal="$3"
              paddingVertical="$2"
              borderRadius="$xs"
              backgroundColor="$successLight"
              minHeight={44}
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize={11} fontWeight="600" color="$successDark">
                Friends
              </Text>
            </XStack>
          ) : null}
        </YStack>
      </XStack>
    );
  }, [pendingActions, handleAddFriend, primaryDark, oceanBlue]);

  const renderHeader = () => (
    <YStack>
      {/* Top Nav */}
      <XStack
        backgroundColor={primaryDark}
        paddingHorizontal="$4"
        paddingVertical="$3"
        alignItems="center"
        gap="$3"
      >
        <XStack
          onPress={() => router.back()}
          pressStyle={{ opacity: 0.7 }}
          hitSlop={12}
          minWidth={44}
          minHeight={44}
          alignItems="center"
          justifyContent="center"
        >
          <ChevronLeft size={24} color="#fff" />
        </XStack>
        <Text fontSize="$5" fontWeight="700" color="$textWhite" flex={1}>
          Find Players
        </Text>
      </XStack>

      {/* Search Bar */}
      <YStack padding="$4" backgroundColor="$background" borderBottomWidth={1} borderBottomColor="$borderLight">
        <XStack
          alignItems="center"
          backgroundColor="$backgroundLight"
          borderRadius="$md"
          paddingHorizontal="$3"
          borderWidth={1.5}
          borderColor="$border"
        >
          <Search size={16} color={oceanBlue} />
          <Input
            flex={1}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or location..."
            borderWidth={0}
            backgroundColor="transparent"
            minHeight={44}
          />
        </XStack>
      </YStack>

      {/* Sort Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        backgroundColor="$background"
        borderBottomWidth={1}
        borderBottomColor="$borderLight"
      >
        {SORT_OPTIONS.map(opt => (
          <XStack
            key={opt.key}
            onPress={() => handleSortChange(opt.key)}
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$xl"
            borderWidth={1.5}
            borderColor={sortBy === opt.key ? primaryDark : '$border'}
            backgroundColor={sortBy === opt.key ? primaryDark : '$background'}
            minHeight={44}
            alignItems="center"
            pressStyle={{ opacity: 0.8 }}
          >
            <Text
              fontSize={12}
              fontWeight="600"
              color={sortBy === opt.key ? '$textWhite' : '$textSecondary'}
            >
              {opt.label}
            </Text>
          </XStack>
        ))}
      </ScrollView>

      {/* Level Filter Chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 10, gap: 8 }}
        backgroundColor="$background"
        borderBottomWidth={1}
        borderBottomColor="$borderLight"
      >
        {LEVEL_FILTERS.map(level => (
          <XStack
            key={level}
            onPress={() => handleLevelFilter(level)}
            paddingHorizontal="$3"
            paddingVertical="$2"
            borderRadius="$xl"
            borderWidth={1.5}
            borderColor={activeLevel === level ? oceanBlue : '$border'}
            backgroundColor={activeLevel === level ? '$seafoamLight' : '$background'}
            minHeight={44}
            alignItems="center"
            pressStyle={{ opacity: 0.8 }}
          >
            <Text
              fontSize={12}
              fontWeight="600"
              color={activeLevel === level ? oceanBlue : '$textSecondary'}
            >
              {level}
            </Text>
          </XStack>
        ))}
      </ScrollView>

      {/* Results Count */}
      <XStack paddingHorizontal="$4" paddingVertical="$2" backgroundColor="$background">
        <Text fontSize="$1" color="$textSecondary">
          {totalCount} {totalCount === 1 ? 'player' : 'players'} found
        </Text>
      </XStack>
    </YStack>
  );

  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <YStack padding="$4" alignItems="center">
        <ActivityIndicator size="small" color={oceanBlue} />
      </YStack>
    );
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <YStack padding="$6" alignItems="center" gap="$3">
        <Text fontSize="$3" fontWeight="600" color="$textSecondary">
          No players found
        </Text>
        <Text fontSize="$2" color="$textLight" textAlign="center">
          Try adjusting your search or filters
        </Text>
      </YStack>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: primaryDark }} edges={['top']}>
      <YStack flex={1} backgroundColor="$background">
        {loading && players.length === 0 ? (
          <>
            {renderHeader()}
            <YStack flex={1} alignItems="center" justifyContent="center">
              <ActivityIndicator size="large" color={oceanBlue} />
            </YStack>
          </>
        ) : (
          <FlatList
            data={players}
            keyExtractor={item => String(item.id)}
            renderItem={renderPlayerCard}
            ListHeaderComponent={renderHeader}
            ListFooterComponent={renderFooter}
            ListEmptyComponent={renderEmpty}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={oceanBlue}
              />
            }
          />
        )}
      </YStack>
    </SafeAreaView>
  );
}
