import { expect, it } from "vitest";
import type { SeasonPointsData, SeasonPointsPlayer } from "@beach-kings/shared";
import { calendarData, sessionSummary, csvCell } from "./model";

const player: SeasonPointsPlayer = {
  id: "1",
  name: "Test Player",
  rank: 1,
  games: 3,
  wins: 2,
  points: 111,
  complete: true,
  // An older session was recorded after the newer sessions.
  history: [
    {
      match: 1,
      session: "first",
      date: "2026-01-01",
      points: 105,
      change: 5,
      result: "W",
    },
    {
      match: 2,
      session: "second",
      date: "2026-01-02",
      points: 108,
      change: 3,
      result: "W",
    },
    {
      match: 3,
      session: "backfill",
      date: "2026-01-01",
      points: 111,
      change: 3,
      result: "L",
    },
  ],
};
const season: SeasonPointsData = {
  league: "Test League",
  season: "Winter",
  startDate: "2026-01-01",
  endDate: null,
  baseline: 100,
  scoringSystem: "season_rating",
  fetchedAt: "2026-01-03T00:00:00Z",
  players: [player],
  sessions: [
    { id: "first", date: "2026-01-01", games: 1, status: "SUBMITTED" },
    { id: "second", date: "2026-01-02", games: 1, status: "SUBMITTED" },
    { id: "backfill", date: "2026-01-01", games: 1, status: "SUBMITTED" },
    { id: "absent", date: "2026-01-03", games: 1, status: "SUBMITTED" },
  ],
};

it("keeps the baseline and every session distinct, including sessions on the start date", () => {
  const rows = calendarData([player], season);
  expect(rows.map((row) => row["1"])).toEqual([100, 105, 108, 111, 111]);
  expect(rows.map((row) => row.sessionIndex)).toEqual([-1, 0, 1, 2, 3]);
  expect(new Set(rows.map((row) => row.x)).size).toBe(5);
  expect(rows[2].x - rows[1].x).toBeGreaterThan(3600000);
  expect(rows.every((row, i) => i === 0 || row.x > rows[i - 1].x)).toBe(true);
  expect(new Date(rows[1].x).toISOString().slice(0, 10)).toBe("2026-01-01");
  expect(new Date(rows[2].x).toISOString().slice(0, 10)).toBe("2026-01-01");
});

it("summarizes individual sessions and preserves official changes when sessions are backfilled", () => {
  expect(sessionSummary(player, "first", season)).toEqual({
    games: 1,
    change: 5,
    points: 105,
  });
  expect(sessionSummary(player, "backfill", season)).toEqual({
    games: 1,
    change: 3,
    points: 108,
  });
  expect(sessionSummary(player, "second", season)).toEqual({
    games: 1,
    change: 3,
    points: 111,
  });
  expect(sessionSummary(player, "absent", season)).toEqual({
    games: 0,
    change: 0,
    points: 111,
  });
});

it("exports names as text without turning negative numeric points into strings", () => {
  expect(csvCell("=1+1")).toBe('"\'=1+1"');
  expect(csvCell("  @SUM(A1)")).toBe('"\'  @SUM(A1)"');
  expect(csvCell('A "Player"')).toBe('"A ""Player"""');
  expect(csvCell(-3)).toBe('"-3"');
});
