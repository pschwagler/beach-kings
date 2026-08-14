/**
 * Display-oriented types for the League Sign Ups tab.
 *
 * These are mobile UI DTOs (date badge parts, status labels) derived from the
 * backend `LeagueSignupItem` contract in `@beach-kings/shared`. They live with
 * the screen that consumes them rather than in the shared package because they
 * are presentation shapes, not API contracts.
 */

export type LeagueEventStatus = 'upcoming' | 'in_progress' | 'completed';

/** An upcoming event card in the sign-ups tab. */
export interface LeagueEvent {
  readonly id: number;
  readonly title: string;
  readonly date: string;
  readonly month_abbr: string;
  readonly day: number;
  readonly time_label: string;
  readonly spots_total: number | null;
  readonly spots_remaining: number | null;
  readonly court_name: string | null;
  readonly status: LeagueEventStatus;
  /** Current user's relationship to this event. */
  readonly user_status: 'signed_up' | 'waitlisted' | 'none';
  readonly attendee_count: number;
}
