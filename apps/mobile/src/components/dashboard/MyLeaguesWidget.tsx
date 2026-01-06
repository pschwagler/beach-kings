import React from 'react';
import { YStack, XStack, Text, Button as TamaguiButton } from 'tamagui';
import { Trophy, ChevronRight, Users, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { api } from '../../services/api';
import { Card, CardHeader, CardContent } from '../ui/Card';

interface League {
  id: number;
  name: string;
  location_name?: string;
  member_count?: number;
}

interface MyLeaguesWidgetProps {
  leagues?: League[];
  onLeagueClick?: (leagueId: number) => void;
  onLeaguesUpdate?: () => Promise<void>;
}

export function MyLeaguesWidget({ leagues = [], onLeagueClick, onLeaguesUpdate }: MyLeaguesWidgetProps) {
  const router = useRouter();
  const { openModal } = useModal();

  const handleLeagueClick = (leagueId: number) => {
    if (onLeagueClick) {
      onLeagueClick(leagueId);
    } else {
      router.push(`/league/${leagueId}`);
    }
  };

  const handleCreateLeague = async (leagueData: any) => {
    try {
      await api.createLeague(leagueData);
      if (onLeaguesUpdate) {
        await onLeaguesUpdate();
      }
    } catch (error) {
      throw error;
    }
  };

  const handleCreateLeagueClick = () => {
    openModal(MODAL_TYPES.CREATE_LEAGUE, {
      onSubmit: handleCreateLeague,
    });
  };

  if (!leagues || leagues.length === 0) {
    return (
      <Card>
        <CardHeader>
          <XStack alignItems="center" justifyContent="space-between">
            <XStack alignItems="center" gap="$2">
              <Trophy size={20} color="$oceanBlue" />
              <Text fontSize="$6" fontWeight="700" color="$textPrimary">
                My Leagues
              </Text>
            </XStack>
            <TamaguiButton
              size="$3"
              icon={Plus}
              onPress={handleCreateLeagueClick}
              backgroundColor="$oceanBlue"
              color="$textWhite"
              fontSize="$3"
              paddingHorizontal="$3"
            >
              Create
            </TamaguiButton>
          </XStack>
        </CardHeader>
        <CardContent>
          <YStack alignItems="center" paddingVertical="$6" gap="$2">
            <Trophy size={40} color="$textSecondary" />
            <Text fontSize="$5" color="$textSecondary" fontWeight="600">
              No leagues found
            </Text>
            <Text fontSize="$4" color="$textLight" textAlign="center">
              Join or create a league to get started
            </Text>
          </YStack>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <XStack alignItems="center" justifyContent="space-between">
          <XStack alignItems="center" gap="$2">
            <Trophy size={20} color="$oceanBlue" />
            <Text fontSize="$6" fontWeight="700" color="$textPrimary">
              My Leagues
            </Text>
          </XStack>
          <TamaguiButton
            size="$3"
            icon={Plus}
            onPress={handleCreateLeagueClick}
            backgroundColor="$oceanBlue"
            color="$textWhite"
            fontSize="$3"
            paddingHorizontal="$3"
          >
            Create
          </TamaguiButton>
        </XStack>
      </CardHeader>
      <CardContent>
        <YStack gap="$2">
          {leagues.slice(0, 5).map((league) => (
            <XStack
              key={league.id}
              alignItems="center"
              justifyContent="space-between"
              paddingVertical="$3"
              paddingHorizontal="$3"
              backgroundColor="$background"
              borderRadius="$3"
              onPress={() => handleLeagueClick(league.id)}
              pressStyle={{ opacity: 0.8 }}
              cursor="pointer"
            >
              <YStack flex={1} gap="$1">
                <Text fontSize="$5" fontWeight="600" color="$textPrimary">
                  {league.name}
                </Text>
                <XStack gap="$3" alignItems="center">
                  {league.location_name && (
                    <Text fontSize="$3" color="$textSecondary">
                      {league.location_name}
                    </Text>
                  )}
                  <XStack gap="$1" alignItems="center">
                    <Users size={14} color="$textSecondary" />
                    <Text fontSize="$3" color="$textSecondary">
                      {league.member_count || 0}
                    </Text>
                  </XStack>
                </XStack>
              </YStack>
              <ChevronRight size={20} color="$textSecondary" />
            </XStack>
          ))}
          {leagues.length > 5 && (
            <Text fontSize="$3" color="$textLight" textAlign="center" marginTop="$2">
              +{leagues.length - 5} more league{leagues.length - 5 !== 1 ? 's' : ''}
            </Text>
          )}
        </YStack>
      </CardContent>
    </Card>
  );
}


