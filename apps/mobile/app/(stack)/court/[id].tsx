import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import CourtDetailScreen from '@/components/screens/Venues/CourtDetailScreen';

export default function CourtDetailRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CourtDetailScreen idOrSlug={id} />;
}
