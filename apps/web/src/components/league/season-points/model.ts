import type { SeasonPointsData, SeasonPointsPlayer } from "@beach-kings/shared";
export type Player = SeasonPointsPlayer;
export const number = (value: number, digits = 1) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });
export const change = (value: number) =>
  `${value > 0 ? "+" : ""}${number(value)}`;
export const date = (value: string, long = false) =>
  new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: long ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  });
/** Calendar order uses session dates; ties retain the server's recorded order. */
export function calendarSessions(season: SeasonPointsData) {
  return [...season.sessions].sort((a, b) => a.date.localeCompare(b.date));
}
export function sessionSummary(
  player: Player,
  sessionId: string,
  season: SeasonPointsData,
) {
  let points = season.baseline;
  for (const session of calendarSessions(season)) {
    const played = player.history.filter((h) => h.session === session.id);
    const change = played.reduce((total, event) => total + event.change, 0);
    points += change;
    if (session.id === sessionId)
      return { games: played.length, change, points };
  }
  return { games: 0, change: 0, points };
}
export const chartColor = (player: Player, spotlightId: string) =>
  player.id === spotlightId
    ? "var(--primary)"
    : `hsl(${(player.rank * 137.508 + 15) % 360} 43% 41%)`;
export function calendarData(players: Player[], season: SeasonPointsData) {
  const sessions = calendarSessions(season);
  const start = [season.startDate, ...sessions.map((s) => s.date)].sort()[0];
  const baseline: Record<string, number> = {
    x: Date.parse(`${start}T00:00:00Z`),
    sessionIndex: -1,
  };
  for (const player of players) baseline[player.id] = season.baseline;
  const dayCounts = new Map<string, number>();
  const dayIndices = new Map<string, number>();
  for (const session of sessions)
    dayCounts.set(session.date, (dayCounts.get(session.date) ?? 0) + 1);
  let previous = baseline;
  return [
    baseline,
    ...sessions.map((session, sessionIndex) => {
      const dayIndex = (dayIndices.get(session.date) ?? 0) + 1;
      dayIndices.set(session.date, dayIndex);
      // Spread same-day sessions within their day so each dot can be hovered/tapped.
      const x =
        Date.parse(`${session.date}T00:00:00Z`) +
        (dayIndex / (dayCounts.get(session.date)! + 1)) * 86400000;
      const row: Record<string, number> = { x, sessionIndex };
      for (const player of players) {
        // Apply official session deltas in calendar order, preserving both the
        // final standings and actual changes when older sessions are backfilled.
        const delta = player.history
          .filter((h) => h.session === session.id)
          .reduce((total, event) => total + event.change, 0);
        row[player.id] = previous[player.id] + delta;
      }
      previous = row;
      return row;
    }),
  ];
}
export function csvCell(value: string | number) {
  // Quoting alone does not prevent spreadsheet formulas in player names.
  const safeValue =
    typeof value === "string" && /^\s*[=+@-]/.test(value)
      ? `'${value}`
      : String(value);
  return `"${safeValue.replaceAll('"', '""')}"`;
}
