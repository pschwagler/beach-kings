/**
 * Data hook for the League Sign Ups tab.
 *
 * Fetches upcoming signups and the weekly schedule from the real backend via
 * GET /api/leagues/:id/signups, then maps the API response to the
 * display-oriented `LeagueEvent` shape consumed by `LeagueSignupsTab`.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LeagueEvent, LeagueScheduleRow } from '@/lib/mockApi';
import type { LeagueSignupItem } from '@beach-kings/shared';
import { leagueKeys } from './leagueKeys';

export interface UseLeagueSignupsTabResult {
  readonly events: readonly LeagueEvent[];
  readonly schedule: readonly LeagueScheduleRow[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onSignUp: (eventId: number) => Promise<void>;
  readonly onDrop: (eventId: number) => Promise<void>;
  readonly pendingEventIds: ReadonlySet<number>;
}

/** Month abbreviations used when building the date badge. */
const MONTH_ABBREVS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/** Short day names used when building the event title. */
const SHORT_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Map a `LeagueSignupItem` from the API to the `LeagueEvent` display shape.
 *
 * All date/time values are derived from `scheduled_datetime` (ISO UTC string).
 */
function mapSignupToEvent(item: LeagueSignupItem): LeagueEvent {
  const dt = new Date(item.scheduled_datetime);

  const monthAbbr = MONTH_ABBREVS[dt.getMonth()] ?? '';
  const day = dt.getDate();
  const dayName = SHORT_DAY_NAMES[dt.getDay()] ?? '';

  // Format time as "h:mm AM/PM".
  const hours = dt.getHours();
  const minutes = dt.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  const displayMin = String(minutes).padStart(2, '0');
  const timeLabel = `${displayHour}:${displayMin} ${ampm}`;

  const title = `${dayName}, ${monthAbbr} ${day}`;

  return {
    id: item.id,
    title,
    date: item.scheduled_datetime.slice(0, 10),
    month_abbr: monthAbbr,
    day,
    time_label: timeLabel,
    spots_total: null,
    spots_remaining: null,
    court_name: item.court_name,
    status: 'upcoming',
    user_status: item.user_status,
    attendee_count: item.player_count,
  };
}

/**
 * Returns all data and handlers needed by LeagueSignupsTab.
 */
export function useLeagueSignupsTab(leagueId: number | string): UseLeagueSignupsTabResult {
  const queryClient = useQueryClient();
  const numericLeagueId = Number(leagueId);

  const signupsQuery = useQuery({
    queryKey: leagueKeys.events(leagueId),
    queryFn: () => api.getLeagueSignups(numericLeagueId),
  });

  const pendingEventIds = new Set<number>();

  const invalidateEvents = useCallback((): Promise<void> => {
    return queryClient.invalidateQueries({ queryKey: leagueKeys.events(leagueId) });
  }, [queryClient, leagueId]);

  const onSignUp = useCallback(
    async (eventId: number): Promise<void> => {
      await api.joinSignup(eventId);
      await invalidateEvents();
    },
    [invalidateEvents],
  );

  const onDrop = useCallback(
    async (eventId: number): Promise<void> => {
      await api.dropSignup(eventId);
      await invalidateEvents();
    },
    [invalidateEvents],
  );

  const rawSignups = signupsQuery.data?.signups ?? [];
  const rawSchedule = signupsQuery.data?.schedule ?? [];

  return {
    events: rawSignups.map(mapSignupToEvent),
    schedule: rawSchedule,
    isLoading: signupsQuery.isLoading,
    isError: signupsQuery.isError,
    onSignUp,
    onDrop,
    pendingEventIds,
  };
}
