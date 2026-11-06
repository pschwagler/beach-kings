import type { GameHistoryEntry } from '@beach-kings/shared';

export interface HistorySession {
  readonly sessionId: number;
  readonly date: string | null;
  readonly games: readonly GameHistoryEntry[];
}

/** Keep server ordering, but gather each session once even across interleaved games. */
export function groupHistorySessions(games: readonly GameHistoryEntry[]): readonly HistorySession[] {
  const grouped = new Map<number, GameHistoryEntry[]>();
  for (const game of games) {
    const existing = grouped.get(game.session_id);
    if (existing) existing.push(game);
    else grouped.set(game.session_id, [game]);
  }
  return [...grouped].map(([sessionId, entries]) => ({
    sessionId,
    date: entries.find((game) => game.session_date != null)?.session_date ?? null,
    games: entries,
  }));
}

/** Session dates describe a calendar day, not midnight UTC in the viewer's zone. */
export function historySessionDate(value: string | null): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!parts) return 'Date unavailable';
  const [, year, month, day] = parts;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) {
    return 'Date unavailable';
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
