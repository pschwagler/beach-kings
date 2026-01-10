import React, { useState, useEffect } from 'react';
import { YStack, XStack, Text, ScrollView, useTheme, getTokens } from 'tamagui';
import { Target, TrendingUp, Award, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/api';
import { MyLeaguesWidget } from '../dashboard/MyLeaguesWidget';
import { MyMatchesWidget } from '../dashboard/MyMatchesWidget';

interface HomeTabProps {
  currentUserPlayer?: any;
  userLeagues?: any[];
  onTabChange?: (tab: string) => void;
  onLeaguesUpdate?: () => Promise<void>;
}

const getAvatarInitial = (currentUserPlayer: any) => {
  if (currentUserPlayer?.nickname) {
    return currentUserPlayer.nickname.trim().charAt(0).toUpperCase();
  }
  if (currentUserPlayer?.full_name) {
    return currentUserPlayer.full_name.trim().charAt(0).toUpperCase();
  }
  return '?';
};

export function HomeTab({ currentUserPlayer, userLeagues = [], onTabChange, onLeaguesUpdate }: HomeTabProps) {
  const router = useRouter();
  const theme = useTheme();
  const tokens = getTokens();
  const [userMatches, setUserMatches] = useState<any[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);
  
  // Get color values for icons (icons need actual color values, not theme tokens)
  const oceanBlue = (tokens.color as any)?.oceanBlue?.val || '#4a90a4';
  const primaryDark = (tokens.color as any)?.primaryDark?.val || '#205e6f';

  // Debug logging
  useEffect(() => {
    console.log('[HomeTab] currentUserPlayer:', currentUserPlayer);
    console.log('[HomeTab] userLeagues:', userLeagues);
  }, [currentUserPlayer, userLeagues]);

  // Load user matches
  useEffect(() => {
    const loadUserMatches = async () => {
      if (!currentUserPlayer) {
        console.log('[HomeTab] No currentUserPlayer, skipping matches load');
        return;
      }

      setLoadingMatches(true);
      try {
        const playerId = currentUserPlayer.id;
        console.log('[HomeTab] Loading matches for player ID:', playerId);
        
        if (!playerId) {
          console.warn('[HomeTab] No player ID found in currentUserPlayer:', currentUserPlayer);
          setUserMatches([]);
          return;
        }

        // Use axios directly to get matches by player ID
        const response = await api.axios.get(`/api/players/${playerId}/matches`);
        const matches = response.data;
        console.log('[HomeTab] Loaded matches:', matches?.length || 0);
        
        const sortedMatches = (matches || [])
          .sort((a: any, b: any) => {
            const dateA = a.Date ? new Date(a.Date).getTime() : 0;
            const dateB = b.Date ? new Date(b.Date).getTime() : 0;
            return dateB - dateA;
          });
        setUserMatches(sortedMatches);
      } catch (error: any) {
        console.error('[HomeTab] Error loading user matches:', error);
        console.error('[HomeTab] Error details:', error.response?.data || error.message);
        setUserMatches([]);
      } finally {
        setLoadingMatches(false);
      }
    };

    loadUserMatches();
  }, [currentUserPlayer]);

  const navigateToLeague = (leagueId: number) => {
    router.push(`/league/${leagueId}`);
  };

  const avatarInitial = getAvatarInitial(currentUserPlayer);
  const fullName = currentUserPlayer?.full_name || currentUserPlayer?.nickname || currentUserPlayer?.name || 'Player';

  // Calculate stats from match history
  const calculateStatsFromMatches = () => {
    if (!userMatches || userMatches.length === 0) {
      return {
        totalGames: currentUserPlayer?.stats?.total_games ?? 0,
        currentRating: currentUserPlayer?.stats?.current_rating ?? 0,
        games30Days: 0,
        winRate30Days: 0,
      };
    }

    // Filter out pending matches (active sessions)
    const completedMatches = userMatches.filter((match: any) => {
      const sessionStatus = match['Session Status'];
      return sessionStatus !== 'ACTIVE';
    });

    // Calculate total games from completed matches
    const totalGames = completedMatches.length;

    // Calculate current rating from most recent completed match
    let currentRating = currentUserPlayer?.stats?.current_rating || 1200;
    if (completedMatches.length > 0) {
      const sortedMatches = [...completedMatches].sort((a: any, b: any) => {
        const dateA = a.Date ? new Date(a.Date).getTime() : 0;
        const dateB = b.Date ? new Date(b.Date).getTime() : 0;
        return dateB - dateA;
      });

      const mostRecentMatch = sortedMatches[0];
      if (mostRecentMatch['ELO After'] !== undefined && mostRecentMatch['ELO After'] !== null) {
        currentRating = mostRecentMatch['ELO After'];
      }
    }

    // Calculate 30-day stats
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentMatches = completedMatches.filter((match: any) => {
      if (!match.Date) return false;
      const matchDate = new Date(match.Date);
      return matchDate >= thirtyDaysAgo;
    });

    const games30Days = recentMatches.length;
    const wins = recentMatches.filter((match: any) => match.Result === 'W').length;
    const winRate30Days = games30Days > 0 ? Math.round((wins / games30Days) * 100) : 0;

    return { totalGames, currentRating, games30Days, winRate30Days };
  };

  const { totalGames, currentRating, games30Days, winRate30Days } = calculateStatsFromMatches();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#ffffff' }}>
    <ScrollView flex={1} backgroundColor="$background" marginTop="$6">
      <YStack padding="$5" gap="$4">
        {/* Top Header Row */}
        <XStack alignItems="center" justifyContent="space-between">
          <XStack
            alignItems="center"
            gap="$3"
            onPress={() => onTabChange?.('profile')}
            pressStyle={{ opacity: 0.8 }}
            cursor="pointer"
          >
            <YStack
              width={48}
              height={48}
              borderRadius="$round"
              backgroundColor={oceanBlue}
              alignItems="center"
              justifyContent="center"
            >
              <Text fontSize="$6" fontWeight="700" color="$textWhite">
                {avatarInitial}
              </Text>
            </YStack>
            <Text fontSize="$6" fontWeight="700" color="$textPrimary">
              {fullName}
            </Text>
          </XStack>
          {onTabChange && (
            <XStack
              onPress={() => onTabChange('friends')}
              pressStyle={{ opacity: 0.8 }}
              cursor="pointer"
            >
              <Users size={22} color={oceanBlue} />
            </XStack>
          )}
        </XStack>

        {/* Stats Row */}
        <XStack gap="$3" flexWrap="wrap">
          <YStack
            flex={1}
            minWidth="45%"
            padding="$4"
            backgroundColor="$backgroundLight"
            borderRadius="$4"
            gap="$2"
          >
            <Target size={24} color={primaryDark} />
            <Text fontSize="$3" color="$textSecondary">
              Total Games Played
            </Text>
            <Text fontSize="$7" fontWeight="700" color="$textPrimary">
              {totalGames}
            </Text>
          </YStack>

          <YStack
            flex={1}
            minWidth="45%"
            padding="$4"
            backgroundColor="$backgroundLight"
            borderRadius="$4"
            gap="$2"
          >
            <TrendingUp size={24} color={oceanBlue} />
            <Text fontSize="$3" color="$textSecondary">
              Rating
            </Text>
            <Text fontSize="$7" fontWeight="700" color="$textPrimary">
              {totalGames === 0 && currentRating === 0 ? '—' : Math.round(currentRating)}
            </Text>
          </YStack>

          <YStack
            flex={1}
            minWidth="45%"
            padding="$4"
            backgroundColor="$backgroundLight"
            borderRadius="$4"
            gap="$2"
          >
            <Target size={24} color={oceanBlue} />
            <Text fontSize="$3" color="$textSecondary">
              Games (Last 30 days)
            </Text>
            <Text fontSize="$7" fontWeight="700" color="$textPrimary">
              {games30Days}
            </Text>
          </YStack>

          <YStack
            flex={1}
            minWidth="45%"
            padding="$4"
            backgroundColor="$backgroundLight"
            borderRadius="$4"
            gap="$2"
          >
            <Award size={24} color={oceanBlue} />
            <Text fontSize="$3" color="$textSecondary">
              Win Rate (Last 30 days)
            </Text>
            <Text fontSize="$7" fontWeight="700" color="$textPrimary">
              {games30Days > 0 ? `${winRate30Days}%` : '—'}
            </Text>
          </YStack>
        </XStack>

        {/* Main Content Grid */}
        <YStack gap="$4">
          <MyLeaguesWidget
            leagues={userLeagues}
            onLeagueClick={navigateToLeague}
            onLeaguesUpdate={onLeaguesUpdate}
          />
          <MyMatchesWidget matches={userMatches} currentUserPlayer={currentUserPlayer} />
        </YStack>
      </YStack>
    </ScrollView>
    </SafeAreaView>
  );
}

