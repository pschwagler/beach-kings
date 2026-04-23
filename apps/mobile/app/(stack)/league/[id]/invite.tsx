import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import LeagueInviteScreen from '@/components/screens/Leagues/LeagueInviteScreen';

export default function LeagueInviteRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <LeagueInviteScreen leagueId={id ?? '1'} />;
}
