import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { SessionCreateScreen } from '@/components/screens/Sessions';

function toNumberOrNull(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function toPlayerIds(value: string | string[] | undefined): readonly number[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return [];
  return [...new Set(
    raw
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id) && id > 0),
  )].slice(0, 4);
}

export default function SessionCreateRoute(): React.ReactNode {
  const params = useLocalSearchParams<{
    leagueId?: string;
    seasonId?: string;
    playerIds?: string;
  }>();

  return (
    <SessionCreateScreen
      leagueId={toNumberOrNull(params.leagueId)}
      seasonId={toNumberOrNull(params.seasonId)}
      playerIds={toPlayerIds(params.playerIds)}
    />
  );
}
