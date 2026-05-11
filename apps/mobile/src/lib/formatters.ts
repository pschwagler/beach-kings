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
  if (isNaN(d.getTime())) return '';

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

/**
 * Compact display name: first name plus last-name initial.
 *
 * @example formatPlayerShort('Patrick Schwagler') // "Patrick S"
 * @example formatPlayerShort('Cher')              // "Cher"
 * @example formatPlayerShort('')                  // ""
 */
export function formatPlayerShort(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  const first = parts[0]!;
  const lastInitial = (parts[parts.length - 1]![0] ?? '').toUpperCase();
  return lastInitial.length > 0 ? `${first} ${lastInitial}` : first;
}

// ---------------------------------------------------------------------------
// Session subtitle formatting
// ---------------------------------------------------------------------------

const DAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * Parse a session date string into a local-timezone Date.
 *
 * The backend stores `Session.date` as either `YYYY-MM-DD` (ISO) or
 * `M/D/YYYY` (US) depending on the create path, so this helper handles
 * both. Both formats are constructed in local time so `getDay()` returns
 * the calendar day the user expects regardless of timezone —
 * `new Date('2026-04-01')` would otherwise parse as UTC midnight and
 * shift a day for viewers west of UTC.
 */
export function parseSessionDate(date: string | Date): Date {
  if (typeof date !== 'string') return date;
  const iso = DATE_ONLY_RE.exec(date);
  if (iso != null) {
    return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  }
  const us = US_DATE_RE.exec(date);
  if (us != null) {
    return new Date(Number(us[3]), Number(us[1]) - 1, Number(us[2]));
  }
  return new Date(date);
}

/**
 * Builds the score-screen subtitle from session metadata.
 *
 * - date + courtName → `"{Day} at {court}"`
 * - courtName missing, leagueName present → leagueName
 * - nothing usable → `null`
 *
 * @example formatSessionSubtitle('2026-05-10', 'QBK', null)        // "Sunday at QBK"
 * @example formatSessionSubtitle('2026-05-10', null, 'Sunday League') // "Sunday League"
 * @example formatSessionSubtitle(null, null, null)                  // null
 */
export function formatSessionSubtitle(
  date: string | Date | null | undefined,
  courtName: string | null | undefined,
  leagueName: string | null | undefined,
): string | null {
  const court = courtName?.trim() ?? '';
  const league = leagueName?.trim() ?? '';

  if (date != null && date !== '' && court.length > 0) {
    const d = parseSessionDate(date);
    if (!isNaN(d.getTime())) {
      return `${DAY_NAMES[d.getDay()]} at ${court}`;
    }
  }

  if (league.length > 0) return league;
  return null;
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
