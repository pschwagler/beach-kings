/**
 * Score Game route — thin entry point for the score entry modal.
 *
 * Navigation: routes.scoreGame({ sessionId?, leagueId?, seasonId?, matchId?, gameNumber?, sessionLabel?, headerTitle? })
 * Wireframe refs: score-league.html, score-scoreboard.html
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScoreGameScreen } from '@/components/screens/Games';

function toNumberOrNull(value: string | string[] | undefined): number | null {
  if (value == null) return null;
  const s = Array.isArray(value) ? value[0] : value;
  if (s == null || s.length === 0) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

function toStringOrNull(value: string | string[] | undefined): string | null {
  if (value == null) return null;
  const s = Array.isArray(value) ? value[0] : value;
  return s != null && s.length > 0 ? s : null;
}

export default function ScoreGameRoute(): React.ReactNode {
  const params = useLocalSearchParams<{
    sessionId?: string;
    leagueId?: string;
    seasonId?: string;
    matchId?: string;
    gameNumber?: string;
    sessionLabel?: string;
    headerTitle?: string;
  }>();

  return (
    <ScoreGameScreen
      sessionId={toNumberOrNull(params.sessionId)}
      leagueId={toNumberOrNull(params.leagueId)}
      seasonId={toNumberOrNull(params.seasonId)}
      matchId={toNumberOrNull(params.matchId)}
      gameNumber={toNumberOrNull(params.gameNumber)}
      sessionLabel={toStringOrNull(params.sessionLabel)}
      headerTitle={toStringOrNull(params.headerTitle)}
    />
  );
}
