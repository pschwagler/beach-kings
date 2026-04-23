/**
 * Pure formatting utilities for the Beach Kings mobile app.
 *
 * All functions are side-effect free and have no external dependencies.
 */

// ---------------------------------------------------------------------------
// Date formatting
// ---------------------------------------------------------------------------

const MONTH_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/**
 * Formats a date value as a human-readable string.
 *
 * - `'relative'` — contextual: "just now", "5m ago", "2h ago", "Yesterday", "Mar 15"
 * - `'short'`    — abbreviated month + day: "Mar 15"
 * - `'long'`     — full month + day + year: "March 15, 2025"
 *
 * @param date - ISO string or Date object.
 * @param format - Output format. Default: `'relative'`.
 */
export function formatDate(
  date: string | Date,
  format: 'relative' | 'short' | 'long' = 'relative',
): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  if (format === 'short') {
    return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
  }

  if (format === 'long') {
    return `${MONTH_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  // Relative
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1_000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  if (diffDay === 1) return 'Yesterday';

  // Fall back to short format for older dates
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
}

// ---------------------------------------------------------------------------
// Score / record formatting
// ---------------------------------------------------------------------------

/**
 * Formats a game score as "team1-team2".
 *
 * @example formatGameScore(21, 19) // "21-19"
 */
export function formatGameScore(team1Score: number, team2Score: number): string {
  return `${team1Score}-${team2Score}`;
}

/**
 * Formats a win/loss record as "wins-losses".
 *
 * @example formatRecord(12, 3) // "12-3"
 */
export function formatRecord(wins: number, losses: number): string {
  return `${wins}-${losses}`;
}

/**
 * Formats a win rate percentage string, rounding to the nearest integer.
 * Returns "0%" when there are no games played.
 *
 * @example formatWinRate(8, 2) // "80%"
 * @example formatWinRate(0, 0) // "0%"
 */
export function formatWinRate(wins: number, losses: number): string {
  const total = wins + losses;
  if (total === 0) return '0%';
  return `${Math.round((wins / total) * 100)}%`;
}

// ---------------------------------------------------------------------------
// ELO / ranking formatting
// ---------------------------------------------------------------------------

/**
 * Formats an ELO rating with thousands separator.
 *
 * @example formatElo(1450) // "1,450"
 */
export function formatElo(rating: number): string {
  return rating.toLocaleString('en-US');
}

// ---------------------------------------------------------------------------
// Player name formatting
// ---------------------------------------------------------------------------

interface PlayerNameInput {
  first_name?: string;
  last_name?: string;
  nickname?: string;
}

/**
 * Returns the player's display name, preferring nickname over full name.
 *
 * @example formatPlayerName({ nickname: 'Spike' })            // "Spike"
 * @example formatPlayerName({ first_name: 'Jane', last_name: 'Doe' }) // "Jane Doe"
 * @example formatPlayerName({})                                // ""
 */
export function formatPlayerName(player: PlayerNameInput): string {
  if (player.nickname) return player.nickname;
  const parts = [player.first_name, player.last_name].filter(Boolean);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Ordinal formatting
// ---------------------------------------------------------------------------

/**
 * Appends the correct English ordinal suffix to a number.
 *
 * @example formatOrdinal(1)  // "1st"
 * @example formatOrdinal(11) // "11th"
 * @example formatOrdinal(22) // "22nd"
 */
export function formatOrdinal(n: number): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;

  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;

  switch (mod10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
