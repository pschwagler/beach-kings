import type { SessionGame } from '@beach-kings/shared';
import { parseCalendarDate } from '@/lib/calendarDate';

export interface SessionResultsSummary {
  readonly contextLabel: string;
  readonly date: string;
  readonly games: readonly SessionGame[];
  readonly viewerPlayerId: number | null;
}

type PlayerSlot =
  | 'team1_player1'
  | 'team1_player2'
  | 'team2_player1'
  | 'team2_player2';

const PLAYER_SLOTS = [
  { slot: 'team1_player1', idKey: 'team1_player1_id' },
  { slot: 'team1_player2', idKey: 'team1_player2_id' },
  { slot: 'team2_player1', idKey: 'team2_player1_id' },
  { slot: 'team2_player2', idKey: 'team2_player2_id' },
] as const satisfies readonly {
  readonly slot: PlayerSlot;
  readonly idKey: keyof SessionGame;
}[];

function viewerSlot(game: SessionGame, viewerPlayerId: number | null): PlayerSlot | null {
  if (viewerPlayerId == null || viewerPlayerId <= 0) return null;
  const matches = PLAYER_SLOTS.filter(({ idKey }) => game[idKey] === viewerPlayerId);
  return matches.length === 1 ? matches[0].slot : null;
}

function playerName(
  slot: PlayerSlot,
  name: string,
  resolvedViewerSlot: PlayerSlot | null,
): string {
  if (slot === resolvedViewerSlot) return 'You';
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
    const resolvedViewerSlot = viewerSlot(game, summary.viewerPlayerId);
    const team1 = [
      playerName('team1_player1', game.team1_player1_name, resolvedViewerSlot),
      playerName('team1_player2', game.team1_player2_name, resolvedViewerSlot),
    ].join(' / ');
    const team2 = [
      playerName('team2_player1', game.team2_player1_name, resolvedViewerSlot),
      playerName('team2_player2', game.team2_player2_name, resolvedViewerSlot),
    ].join(' / ');
    return `${team1} ${score(game.team1_score)} – ${score(game.team2_score)} ${team2}`;
  });

  return [header, ...lines].join('\n');
}
