import type { SeasonPointsData, SeasonPointsPlayer } from '@beach-kings/shared';
export type Player = SeasonPointsPlayer;
export const number = (value: number, digits = 1) => value.toLocaleString('en-US', { maximumFractionDigits: digits });
export const change = (value: number) => `${value > 0 ? '+' : ''}${number(value)}`;
export const date = (value: string, long = false) => new Date(`${value.slice(0,10)}T12:00:00Z`).toLocaleDateString('en-US', { month: long ? 'long' : 'short', day: 'numeric', timeZone: 'UTC' });
export function sessionSummary(player: Player, day: string, season: SeasonPointsData) {
  const played = player.history.filter(h => h.date === day);
  const previous = player.history.filter(h => h.date < day).at(-1)?.points ?? season.baseline;
  const points = played.at(-1)?.points ?? previous;
  return { games: played.length, change: points - previous, points };
}
export const chartColor = (player: Player, spotlightId: string) => player.id === spotlightId
  ? 'var(--primary)' : `hsl(${(player.rank * 137.508 + 15) % 360} 43% 41%)`;
export function calendarData(players: Player[], season: SeasonPointsData) {
  const days = [season.startDate, ...Array.from(new Set(season.sessions.map(s => s.date)))].sort();
  return days.map(day => {
    const row: Record<string, number> = { x: Date.parse(`${day}T12:00:00Z`) };
    for (const player of players) row[player.id] = player.history.filter(h => h.date <= day).at(-1)?.points ?? season.baseline;
    return row;
  });
}
