"use client";

import { useState } from "react";
import { Button } from "../ui/UI";
import { Loader2, Check, Edit2 } from "lucide-react";
import "./KobLive.css";

export default function ScoreEntryCard({
  match,
  gameTo,
  winBy,
  gamesPerMatch = 1,
  onSubmit,
  isScored = false,
  isDirector = false,
  onEditScore,
}) {
  const isBo3 = gamesPerMatch >= 3;
  const gameScores = match.game_scores || [];

  // For Bo3: track which game we're entering
  const nextGameIndex = gameScores.length;
  const matchDecided = match.winner !== null && match.winner !== undefined;

  // Series status for Bo3
  const t1GameWins = gameScores.filter((g) => g.team1_score > g.team2_score).length;
  const t2GameWins = gameScores.filter((g) => g.team2_score > g.team1_score).length;

  const [team1Score, setTeam1Score] = useState(
    isScored && !isBo3 ? String(match.team1_score) : ""
  );
  const [team2Score, setTeam2Score] = useState(
    isScored && !isBo3 ? String(match.team2_score) : ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  const validateScore = (s1, s2) => {
    const a = parseInt(s1, 10);
    const b = parseInt(s2, 10);
    if (isNaN(a) || isNaN(b)) return "Enter both scores";
    if (a < 0 || b < 0) return "Scores can't be negative";
    if (a === b) return "Scores can't be tied";
    const high = Math.max(a, b);
    const low = Math.min(a, b);
    if (high < gameTo) return `Winning score must be at least ${gameTo}`;
    if (high - low < winBy) return `Must win by ${winBy}`;
    if (high > gameTo && (high - low) !== winBy) return `Over ${gameTo}: difference must be exactly ${winBy}`;
    return null;
  };

  const handleSubmit = async () => {
    const validationError = validateScore(team1Score, team2Score);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const scoreData = {
        team1_score: parseInt(team1Score),
        team2_score: parseInt(team2Score),
      };
      // For Bo3, don't send game_index on new game (backend appends)
      if (editing && onEditScore) {
        await onEditScore(match.matchup_id, scoreData.team1_score, scoreData.team2_score);
      } else {
        await onSubmit(match.matchup_id, scoreData.team1_score, scoreData.team2_score);
      }
      setEditing(false);
      setTeam1Score("");
      setTeam2Score("");
    } catch (err) {
      setError(err.message || "Failed to submit score");
    } finally {
      setSubmitting(false);
    }
  };

  const team1Names = [match.team1_player1_name, match.team1_player2_name]
    .filter(Boolean)
    .map((n) => n.split(" ")[0])
    .join(" & ");
  const team2Names = [match.team2_player1_name, match.team2_player2_name]
    .filter(Boolean)
    .map((n) => n.split(" ")[0])
    .join(" & ");

  // For single-game: show inputs when not scored or editing
  // For Bo3: show inputs when match not decided (or editing)
  const showInputs = isBo3
    ? (!matchDecided || editing)
    : (!isScored || editing);

  return (
    <div className={`kob-score-card ${(isScored || matchDecided) ? "kob-score-card--scored" : ""}`}>
      {match.court_num && (
        <div className="kob-score-card__court">
          Court {match.court_num}
          {match.bracket_position && (
            <span className="kob-score-card__bracket-label">
              {" "}{match.bracket_position === "final" ? "Final" : match.bracket_position === "semifinal" ? "Semi" : match.bracket_position}
            </span>
          )}
        </div>
      )}

      {/* Bo3 series status */}
      {isBo3 && gameScores.length > 0 && (
        <div className="kob-score-card__series">
          {gameScores.map((g, i) => (
            <span key={i} className="kob-score-card__series-game">
              G{i + 1}: {g.team1_score}-{g.team2_score}
            </span>
          ))}
          <span className="kob-score-card__series-status">
            ({t1GameWins}-{t2GameWins})
          </span>
        </div>
      )}

      {/* Bo3 next game header */}
      {isBo3 && !matchDecided && (
        <div className="kob-score-card__game-header">
          Game {nextGameIndex + 1} of 3
        </div>
      )}

      <div className="kob-score-card__teams">
        {/* Team 1 */}
        <div className={`kob-score-card__team ${matchDecided && match.winner === 1 ? "kob-score-card__team--winner" : ""}`}>
          <span className="kob-score-card__team-names">{team1Names || "Team 1"}</span>
          {showInputs && !matchDecided ? (
            <input
              type="number"
              className="kob-score-card__score-input"
              value={team1Score}
              onChange={(e) => { setTeam1Score(e.target.value); setError(null); }}
              placeholder="0"
              min={0}
              inputMode="numeric"
            />
          ) : !isBo3 ? (
            <span className={`kob-score-card__score ${match.winner === 1 ? "kob-score-card__score--winner" : ""}`}>
              {match.team1_score}
            </span>
          ) : (
            <span className={`kob-score-card__score ${match.winner === 1 ? "kob-score-card__score--winner" : ""}`}>
              {t1GameWins}
            </span>
          )}
        </div>

        <span className="kob-score-card__vs">vs</span>

        {/* Team 2 */}
        <div className={`kob-score-card__team ${matchDecided && match.winner === 2 ? "kob-score-card__team--winner" : ""}`}>
          <span className="kob-score-card__team-names">{team2Names || "Team 2"}</span>
          {showInputs && !matchDecided ? (
            <input
              type="number"
              className="kob-score-card__score-input"
              value={team2Score}
              onChange={(e) => { setTeam2Score(e.target.value); setError(null); }}
              placeholder="0"
              min={0}
              inputMode="numeric"
            />
          ) : !isBo3 ? (
            <span className={`kob-score-card__score ${match.winner === 2 ? "kob-score-card__score--winner" : ""}`}>
              {match.team2_score}
            </span>
          ) : (
            <span className={`kob-score-card__score ${match.winner === 2 ? "kob-score-card__score--winner" : ""}`}>
              {t2GameWins}
            </span>
          )}
        </div>
      </div>

      {error && <p className="kob-score-card__error">{error}</p>}

      {showInputs && !matchDecided && (
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ width: "100%", marginTop: "8px" }}
        >
          {submitting ? (
            <Loader2 size={16} className="spin" />
          ) : editing ? (
            "Update Score"
          ) : isBo3 ? (
            <>
              <Check size={16} /> Submit Game {nextGameIndex + 1}
            </>
          ) : (
            <>
              <Check size={16} /> Submit Score
            </>
          )}
        </Button>
      )}

      {matchDecided && !editing && isDirector && (
        <button
          type="button"
          className="kob-score-card__edit-btn"
          onClick={() => setEditing(true)}
        >
          <Edit2 size={14} /> Edit
        </button>
      )}
    </div>
  );
}
