/**
 * Score Game route — thin entry point for the score entry modal.
 *
 * Accepts an optional `matchId` query param (pre-selects a specific match)
 * but otherwise delegates entirely to ScoreGameScreen.
 *
 * Navigation: routes.scoreGame(matchId?)
 * Wireframe refs: score-league.html, score-scoreboard.html
 */

import React from 'react';
import { ScoreGameScreen } from '@/components/screens/Games';

export default function ScoreGameRoute(): React.ReactNode {
  return <ScoreGameScreen />;
}
