import React, { useState } from 'react';
import { YStack, XStack, Text, ScrollView, Button as TamaguiButton } from 'tamagui';
import { Trophy, Users, ChevronRight, AlertCircle, CheckCircle, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useModal, MODAL_TYPES } from '../../contexts/ModalContext';
import { api } from '../../services/api';
import { Card } from '../ui/Card';
import { ConfirmationModal } from '../modal/ConfirmationModal';

interface League {
  id: number;
  name: string;
  location_name?: string;
  member_count?: number;
}

interface LeaguesTabProps {
  userLeagues?: League[];
  onLeagueClick?: (action: string, leagueId?: number) => void;
  onLeaguesUpdate?: () => Promise<void>;
}

const getErrorMessage = (error: any) => error.response?.data?.detail || error.message || 'Something went wrong';

export function LeaguesTab({ userLeagues = [], onLeagueClick, onLeaguesUpdate }: LeaguesTabProps) {
  const router = useRouter();
  const { openModal } = useModal();
  const [showLeaveLeagueModal, setShowLeaveLeagueModal] = useState(false);
  const [leagueToLeave, setLeagueToLeave] = useState<{ id: number; name: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const handleLeaveLeague = (leagueId: number, leagueName: string) => {
    setLeagueToLeave({ id: leagueId, name: leagueName });
    setShowLeaveLeagueModal(true);
  };

  const confirmLeaveLeague = async () => {
    if (!leagueToLeave) return;

    try {
      await api.leaveLeague(leagueToLeave.id);
      setSuccessMessage(`Successfully left ${leagueToLeave.name}`);
      setShowLeaveLeagueModal(false);
      setLeagueToLeave(null);
      if (onLeaguesUpdate) {
        await onLeaguesUpdate();
      }
    } catch (error: any) {
      console.error('Error leaving league:', error);
      setErrorMessage(getErrorMessage(error));
      setShowLeaveLeagueModal(false);
      setLeagueToLeave(null);
    }
  };

  const handleLeagueCardClick = (leagueId: number) => {
    if (onLeagueClick) {
      onLeagueClick('view-league', leagueId);
    } else {
      router.push(`/league/${leagueId}`);
    }
  };

  const handleCreateLeague = async (leagueData: any) => {
    try {
      const newLeague = await api.createLeague(leagueData);
      if (onLeaguesUpdate) {
        await onLeaguesUpdate();
      }
      if (onLeagueClick) {
        onLeagueClick('view-league', newLeague.id);
      } else {
        router.push(`/league/${newLeague.id}`);
      }
      return newLeague;
    } catch (error) {
      throw error;
    }
  };

  const handleCreateLeagueClick = () => {
    openModal(MODAL_TYPES.CREATE_LEAGUE, {
      onSubmit: handleCreateLeague,
    });
  };

  return (
    <>
      <ScrollView flex={1} backgroundColor="$sand">
        <YStack padding="$5" gap="$4">
          {errorMessage && (
            <XStack
              padding="$3"
              backgroundColor="$dangerLight"
              borderRadius="$3"
              gap="$2"
              alignItems="center"
            >
              <AlertCircle size={18} color="$danger" />
              <Text fontSize="$4" color="$danger" flex={1}>
                {errorMessage}
              </Text>
            </XStack>
          )}
          {successMessage && (
            <XStack
              padding="$3"
              backgroundColor="$successLight"
              borderRadius="$3"
              gap="$2"
              alignItems="center"
            >
              <CheckCircle size={18} color="$success" />
              <Text fontSize="$4" color="$success" flex={1}>
                {successMessage}
              </Text>
            </XStack>
          )}

          <TamaguiButton
            icon={Plus}
            onPress={handleCreateLeagueClick}
            backgroundColor="$oceanBlue"
            color="$textWhite"
            fontSize="$4"
            fontWeight="600"
            padding="$3"
          >
            Create League
          </TamaguiButton>

          {userLeagues.length === 0 ? (
            <Card>
              <YStack alignItems="center" paddingVertical="$8" gap="$3">
                <Trophy size={48} color="$textSecondary" />
                <Text fontSize="$6" fontWeight="700" color="$textPrimary">
                  No leagues found
                </Text>
                <Text fontSize="$4" color="$textSecondary" textAlign="center">
                  You haven't joined any leagues yet.
                </Text>
              </YStack>
            </Card>
          ) : (
            <YStack gap="$3">
              {userLeagues.map((league) => (
                <Card
                  key={league.id}
                  onPress={() => handleLeagueCardClick(league.id)}
                  padding="$4"
                >
                  <XStack alignItems="center" justifyContent="space-between">
                    <YStack flex={1} gap="$2">
                      <Text fontSize="$6" fontWeight="700" color="$textPrimary">
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
                            {league.member_count || 0} members
                          </Text>
                        </XStack>
                      </XStack>
                    </YStack>
                    <XStack gap="$2" alignItems="center">
                      <TamaguiButton
                        size="$3"
                        onPress={(e) => {
                          e?.stopPropagation?.();
                          handleLeaveLeague(league.id, league.name);
                        }}
                        backgroundColor="transparent"
                        color="$danger"
                        fontSize="$3"
                        paddingHorizontal="$2"
                      >
                        Leave
                      </TamaguiButton>
                      <ChevronRight size={20} color="$textSecondary" />
                    </XStack>
                  </XStack>
                </Card>
              ))}
            </YStack>
          )}
        </YStack>
      </ScrollView>

      <ConfirmationModal
        isOpen={showLeaveLeagueModal}
        onClose={() => {
          setShowLeaveLeagueModal(false);
          setLeagueToLeave(null);
        }}
        onConfirm={confirmLeaveLeague}
        title="Leave League"
        message={leagueToLeave ? `Are you sure you want to leave ${leagueToLeave.name}?` : ''}
        confirmText="Leave League"
        cancelText="Cancel"
      />
    </>
  );
}


