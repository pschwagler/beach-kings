import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { TournamentDetailScreen } from '@/components/screens/Tournaments';

export default function TournamentDetailRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <TournamentDetailScreen tournamentId={Number(id)} />;
}
