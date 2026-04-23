import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import KobScreen from '@/components/screens/Kob/KobScreen';

export default function KobRoute(): React.ReactNode {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <KobScreen code={code} />;
}
