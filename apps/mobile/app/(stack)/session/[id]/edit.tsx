import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SessionEditScreen } from '@/components/screens/Sessions';

export default function SessionEditRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SessionEditScreen sessionId={Number(id)} />;
}
