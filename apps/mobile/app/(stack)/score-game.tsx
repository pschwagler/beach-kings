/**
 * Score Game route — thin entry point for the score entry modal.
 *
 * Accepts optional query params:
 *   - sessionId: number — existing session to add the game to.
 *     When absent, the backend creates a new pickup session on submit.
 *   - leagueId: number — league context; enables the ranked toggle and
 *     scopes the roster picker to league members.
 *
 * Navigation: routes.scoreGame({ sessionId?, leagueId? })
 * Wireframe refs: score-league.html, score-scoreboard.html
 */

import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ScoreGameScreen } from '@/components/screens/Games';

export default function ScoreGameRoute(): React.ReactNode {
  const params = useLocalSearchParams<{ sessionId?: string; leagueId?: string }>();

  const sessionId = params.sessionId != null ? Number(params.sessionId) : null;
  const leagueId = params.leagueId != null ? Number(params.leagueId) : null;

  return (
    <ScoreGameScreen
      sessionId={Number.isNaN(sessionId) ? null : sessionId}
      leagueId={Number.isNaN(leagueId) ? null : leagueId}
    />
  );
}
