/**
 * Data hook for the League Sign Ups tab.
 */

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { mockApi } from '@/lib/mockApi';
import type { LeagueEvent } from '@/lib/mockApi';
import { leagueKeys } from './leagueKeys';

export interface UseLeagueSignupsTabResult {
  readonly events: readonly LeagueEvent[];
  readonly schedule: readonly { day_of_week: string; time_label: string; court_name: string | null }[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onSignUp: (eventId: number) => Promise<void>;
  readonly onDrop: (eventId: number) => Promise<void>;
  readonly pendingEventIds: ReadonlySet<number>;
}

/**
 * Returns all data and handlers needed by LeagueSignupsTab.
 */
export function useLeagueSignupsTab(leagueId: number | string): UseLeagueSignupsTabResult {
  const queryClient = useQueryClient();

  const eventsQuery = useQuery({
    queryKey: leagueKeys.events(leagueId),
    queryFn: () => mockApi.getLeagueEvents(leagueId), // TODO(backend): GET /api/leagues/:id/events
  });

  // We track pending by using React state — but since this is a query hook,
  // use a simple Set stored inside the mutation callbacks.
  const pendingEventIds = new Set<number>();

  const invalidateEvents = useCallback((): Promise<void> => {
    return queryClient.invalidateQueries({ queryKey: leagueKeys.events(leagueId) });
  }, [queryClient, leagueId]);

  const onSignUp = useCallback(
    async (eventId: number): Promise<void> => {
      await mockApi.signUpForEvent(leagueId, eventId); // TODO(backend): POST /api/leagues/:leagueId/events/:eventId/signup
      await invalidateEvents();
    },
    [leagueId, invalidateEvents],
  );

  const onDrop = useCallback(
    async (eventId: number): Promise<void> => {
      await mockApi.dropFromEvent(leagueId, eventId); // TODO(backend): DELETE /api/leagues/:leagueId/events/:eventId/signup
      await invalidateEvents();
    },
    [leagueId, invalidateEvents],
  );

  return {
    events: eventsQuery.data?.events ?? [],
    schedule: eventsQuery.data?.schedule ?? [],
    isLoading: eventsQuery.isLoading,
    isError: eventsQuery.isError,
    onSignUp,
    onDrop,
    pendingEventIds,
  };
}
