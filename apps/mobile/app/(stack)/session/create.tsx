import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SessionCreateScreen } from '@/components/screens/Sessions';

function toNumberOrNull(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function SessionCreateRoute(): React.ReactNode {
  const params = useLocalSearchParams<{
    leagueId?: string;
    seasonId?: string;
  }>();

  return (
    <SessionCreateScreen
      leagueId={toNumberOrNull(params.leagueId)}
      seasonId={toNumberOrNull(params.seasonId)}
    />
  );
}
