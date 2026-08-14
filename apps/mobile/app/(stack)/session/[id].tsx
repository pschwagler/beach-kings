import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SessionDetailScreen } from '@/components/screens/Sessions';

export default function SessionDetailRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionDetailScreen sessionId={Number(id)} />;
}
