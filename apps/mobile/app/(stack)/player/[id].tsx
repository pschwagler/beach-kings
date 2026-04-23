/**
 * Player profile route — thin entry point.
 * Reads the [id] param and delegates to PlayerProfileScreen.
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PlayerProfileScreen } from '@/components/screens/PlayerProfile';

export default function PlayerProfileRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <PlayerProfileScreen playerId={id ?? ''} />;
}
