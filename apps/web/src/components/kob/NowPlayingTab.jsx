"use client";

import { useState } from "react";
import ScoreEntryCard from "./ScoreEntryCard";
import "./KobLive.css";

/**
 * Determine effective game_to for a match based on phase.
 * Playoff matches use playoff_game_to if set, otherwise fall back to game_to.
 */
function getEffectiveGameTo(tournament, match) {
  if (match.phase === "playoffs" && tournament.playoff_game_to) {
    return tournament.playoff_game_to;
  }
  return tournament.game_to;
}

/**
 * Determine effective games_per_match for a match based on phase.
 */
function getEffectiveGamesPerMatch(tournament, match) {
  if (match.phase === "playoffs" && tournament.playoff_games_per_match) {
    return tournament.playoff_games_per_match;
  }
  return tournament.games_per_match || 1;
}

export default function NowPlayingTab({ matches, tournament, onScoreSubmit, isDirector, onEditScore }) {
  if (!matches || matches.length === 0) {
    return (
      <div className="kob-now__empty">
        <p>No matches in the current round.</p>
      </div>
    );
  }

  const unscoredMatches = matches.filter((m) => m.team1_score === null && !m.is_bye);
  const scoredMatches = matches.filter((m) => m.team1_score !== null);
  const byeMatches = matches.filter((m) => m.is_bye);

  return (
    <div className="kob-now">
      {unscoredMatches.length > 0 && (
        <div className="kob-now__section">
          <h3 className="kob-now__section-title">In Progress</h3>
          <div className="kob-now__cards">
            {unscoredMatches.map((match) => (
              <ScoreEntryCard
                key={match.matchup_id}
                match={match}
                gameTo={getEffectiveGameTo(tournament, match)}
                winBy={tournament.win_by}
                gamesPerMatch={getEffectiveGamesPerMatch(tournament, match)}
                onSubmit={onScoreSubmit}
              />
            ))}
          </div>
        </div>
      )}

      {scoredMatches.length > 0 && (
        <div className="kob-now__section">
          <h3 className="kob-now__section-title">Completed</h3>
          <div className="kob-now__cards">
            {scoredMatches.map((match) => (
              <ScoreEntryCard
                key={match.matchup_id}
                match={match}
                gameTo={getEffectiveGameTo(tournament, match)}
                winBy={tournament.win_by}
                gamesPerMatch={getEffectiveGamesPerMatch(tournament, match)}
                onSubmit={onScoreSubmit}
                isScored
                isDirector={isDirector}
                onEditScore={onEditScore}
              />
            ))}
          </div>
        </div>
      )}

      {unscoredMatches.length === 0 && scoredMatches.length > 0 && (
        <div className="kob-now__all-done">
          All matches this round are scored!
        </div>
      )}
    </div>
  );
}
