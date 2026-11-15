import type { SessionGame } from '@beach-kings/shared';
import { parseCalendarDate } from '@/lib/calendarDate';

export interface SessionResultsSummary {
  readonly contextLabel: string;
  readonly date: string;
  readonly games: readonly SessionGame[];
}

function playerName(name: string): string {
  const trimmed = name.trim();
  return trimmed === '' ? 'Unknown player' : trimmed;
}

function score(value: number | null): string {
  return value == null ? '—' : String(value);
}

function formatDate(value: string): string {
  const parsed = parseCalendarDate(value);
  if (parsed == null) return value.trim();
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Builds the exact plain-text clipboard output shown by Copy Results. */
export function formatSessionResults(summary: SessionResultsSummary): string {
  const header = `${summary.contextLabel.trim()} · ${formatDate(summary.date)}`;
  const lines = summary.games.map((game) => {
    const team1 = [
      playerName(game.team1_player1_name),
      playerName(game.team1_player2_name),
    ].join(' / ');
    const team2 = [
      playerName(game.team2_player1_name),
      playerName(game.team2_player2_name),
    ].join(' / ');
    return `${team1} ${score(game.team1_score)} – ${score(game.team2_score)} ${team2}`;
  });

  return [header, ...lines].join('\n');
}
