import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SessionRosterScreen } from '@/components/screens/Sessions';

export default function SessionRosterRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionRosterScreen sessionId={Number(id)} />;
}
