import type { SessionGame } from '@beach-kings/shared';
import { parseCalendarDate } from '@/lib/calendarDate';

export interface SessionResultsSummary {
  readonly contextLabel: string;
  readonly date: string;
  readonly games: readonly SessionGame[];
}

const MONOSPACE = '```';
const PLAYER_WIDTH = 19;

function inlineText(value: string | null | undefined): string {
  // Keep user text inside the monospace block and on the intended row.
  return (value ?? '').replace(/\s+/g, ' ').trim().replace(/`/g, '｀');
}

function wrapText(value: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(' ')) {
    const joined = line === '' ? word : `${line} ${word}`;
    if (line !== '' && Array.from(joined).length > width) {
      lines.push(line);
      line = word;
    } else {
      line = joined;
    }
  }
  lines.push(line);
  return lines;
}

function score(value: number | null): string {
  return value == null ? '—' : String(value);
}

function formatDate(value: string): string {
  const parsed = parseCalendarDate(value);
  if (parsed == null) return inlineText(value);
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** Builds a plain-text table with WhatsApp's monospace delimiters. */
export function formatSessionResults(summary: SessionResultsSummary): string {
  const header = [inlineText(summary.contextLabel), formatDate(summary.date)].filter(Boolean);
  const games = summary.games.map((game) => ({
    number: `#${game.game_number}`,
    teams: [
      { points: score(game.team1_score), names: [game.team1_player1_name, game.team1_player2_name] },
      { points: score(game.team2_score), names: [game.team2_player1_name, game.team2_player2_name] },
    ],
  }));
  const gameWidth = games.reduce((width, game) => Math.max(width, game.number.length), 'Game'.length);
  const pointsWidth = games.reduce(
    (width, { teams }) => Math.max(width, ...teams.map(({ points }) => points.length)),
    'Pts'.length,
  );
  const row = (game: string, points: string, name: string) =>
    `${game.padStart(gameWidth)}  ${points.padStart(pointsWidth)}  ${name}`;
  const rule = row('-'.repeat(gameWidth), '-'.repeat(pointsWidth), '-'.repeat(PLAYER_WIDTH));
  const lines = header.flatMap((text) => wrapText(text, rule.length));

  if (games.length > 0) lines.push('', row('Game', 'Pts', 'Players'));
  games.forEach(({ number, teams }) => {
    lines.push(rule);
    teams.forEach(({ points, names }, teamIndex) => {
      const [first, ...rest] = names.flatMap((name) =>
        wrapText(inlineText(name) || 'Unknown player', PLAYER_WIDTH),
      );
      lines.push(row(teamIndex === 0 ? number : '', points, first));
      rest.forEach((name) => lines.push(row('', '', name)));
    });
  });

  return `${MONOSPACE}${lines.join('\n')}${MONOSPACE}`;
}
