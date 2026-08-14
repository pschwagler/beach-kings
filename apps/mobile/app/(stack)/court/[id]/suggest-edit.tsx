import React from 'react';
import { useLocalSearchParams } from 'expo-router';

import SuggestCourtEditScreen from '@/components/screens/Venues/SuggestCourtEditScreen';

export default function SuggestCourtEditRoute(): React.ReactNode {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SuggestCourtEditScreen idOrSlug={id} />;
}
