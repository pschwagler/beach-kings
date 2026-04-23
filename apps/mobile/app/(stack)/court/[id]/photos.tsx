import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import CourtPhotosScreen from '@/components/screens/Venues/CourtPhotosScreen';

export default function CourtPhotosRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CourtPhotosScreen idOrSlug={id} />;
}
