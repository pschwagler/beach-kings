"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import "./KobLive.css";

interface ScheduleTabProps {
  matches: any[];
  scheduleData?: any;
  currentRound?: number;
}

export default function ScheduleTab({ matches, scheduleData, currentRound }: ScheduleTabProps) {
  const [expandedRound, setExpandedRound] = useState(currentRound);

  // Keep expandedRound in sync when the current round advances (e.g. after polling).
  useEffect(() => {
    setExpandedRound(currentRound);
  }, [currentRound]);

  if (!matches || matches.length === 0) {
    return (
      <div className="kob-schedule__empty">
        <p>Schedule not yet generated.</p>
      </div>
    );
  }

  // Group matches by round
  const rounds = {};
  for (const match of matches) {
    if (!rounds[match.round_num]) {
      rounds[match.round_num] = [];
    }
    rounds[match.round_num].push(match);
  }

  const roundNums = Object.keys(rounds)
    .map(Number)
    .sort((a, b) => a - b);

  // Separate pool play and playoff rounds for display numbering
  const poolPlayNums = roundNums.filter((rn) => rounds[rn][0]?.phase === "pool_play");
  const playoffNums = roundNums.filter((rn) => rounds[rn][0]?.phase !== "pool_play");

  const toggleRound = (roundNum) => {
    setExpandedRound(expandedRound === roundNum ? null : roundNum);
  };

  return (
    <div className="kob-schedule">
      {roundNums.map((roundNum) => {
        const roundMatches = rounds[roundNum];
        const isExpanded = expandedRound === roundNum;
        const isCurrent = roundNum === currentRound;
        const allScored = roundMatches.every((m) => m.team1_score !== null || m.is_bye);
        const phase = roundMatches[0]?.phase;
        const bracketPos = roundMatches[0]?.bracket_position;
        const isPlayoff = phase && phase !== "pool_play";

        // Display number: pool play counts from 1, playoffs restart from 1
        let displayLabel;
        if (bracketPos === "final") {
          displayLabel = "Final";
        } else if (bracketPos === "semifinal") {
          displayLabel = "Semifinal";
        } else if (isPlayoff) {
          const playoffIdx = playoffNums.indexOf(roundNum);
          displayLabel = `Playoff ${playoffIdx + 1}`;
        } else {
          const poolIdx = poolPlayNums.indexOf(roundNum);
          displayLabel = `Round ${poolIdx + 1}`;
        }

        return (
          <div
            key={roundNum}
            className={`kob-schedule__round ${isCurrent ? "kob-schedule__round--current" : ""}`}
          >
            <button
              type="button"
              className="kob-schedule__round-header"
              onClick={() => toggleRound(roundNum)}
            >
              <div className="kob-schedule__round-info">
                <span className="kob-schedule__round-label">
                  {displayLabel}
                  {isPlayoff && !bracketPos && (
                    <span className="kob-schedule__phase-badge">
                      playoffs
                    </span>
                  )}
                </span>
                <span className={`kob-schedule__round-status ${allScored ? "kob-schedule__round-status--done" : ""}`}>
                  {allScored ? "Complete" : isCurrent ? "In Progress" : "Upcoming"}
                </span>
              </div>
              {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {isExpanded && (
              <div className="kob-schedule__matches">
                {roundMatches.map((match) => {
                  const team1Names = [match.team1_player1_name, match.team1_player2_name]
                    .filter(Boolean)
                    .map((n) => n.split(" ")[0])
                    .join(" & ");
                  const team2Names = [match.team2_player1_name, match.team2_player2_name]
                    .filter(Boolean)
                    .map((n) => n.split(" ")[0])
                    .join(" & ");

                  return (
                    <div
                      key={match.matchup_id}
                      className={`kob-schedule__match ${match.is_bye ? "kob-schedule__match--bye" : ""}`}
                    >
                      {match.court_num && (
                        <span className="kob-schedule__court">Ct {match.court_num}</span>
                      )}
                      <div className="kob-schedule__match-teams">
                        <span className={match.winner === 1 ? "kob-schedule__winner" : ""}>
                          {team1Names || "Team 1"}
                        </span>
                        <span className="kob-schedule__match-score">
                          {match.team1_score !== null ? (
                            `${match.team1_score} - ${match.team2_score}`
                          ) : match.is_bye ? (
                            "BYE"
                          ) : (
                            "vs"
                          )}
                        </span>
                        <span className={match.winner === 2 ? "kob-schedule__winner" : ""}>
                          {team2Names || "Team 2"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
