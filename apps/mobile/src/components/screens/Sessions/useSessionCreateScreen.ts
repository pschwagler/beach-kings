/** Data and submission state for creating a session. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import type { LeagueDetail, Season } from '@beach-kings/shared';

import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';

interface UseSessionCreateScreenParams {
  readonly leagueId?: number | null;
  readonly seasonId?: number | null;
}

export interface UseSessionCreateScreenResult {
  readonly date: string;
  readonly startTime: string;
  readonly courtId: number | null;
  readonly leagueName: string | null;
  readonly leagueSeasons: readonly Season[];
  readonly selectedSeasonId: number | null;
  readonly showsSeasonAssignment: boolean;
  readonly isRanked: boolean;
  readonly isRankedLocked: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly setDate: (value: string) => void;
  readonly setStartTime: (value: string) => void;
  readonly setCourtId: (value: number | null) => void;
  readonly setSelectedSeasonId: (value: number | null) => void;
  readonly setIsRanked: (value: boolean) => void;
  readonly onSubmit: () => Promise<void>;
}

/** Returns form state and submit handler for creating a new session. */
export function useSessionCreateScreen(
  params: UseSessionCreateScreenParams = {},
): UseSessionCreateScreenResult {
  const router = useRouter();
  const leagueId = params.leagueId ?? null;
  const today = new Date().toISOString().split('T')[0];
  const { data: league } = useApi<LeagueDetail>(
    () => api.getLeague(Number(leagueId)),
    [leagueId],
    { enabled: leagueId != null },
  );
  const { data: leagueSeasons } = useApi<Season[]>(
    () => api.getLeagueSeasons(Number(leagueId)),
    [leagueId],
    { enabled: leagueId != null },
  );

  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('');
  const [courtId, setCourtId] = useState<number | null>(null);
  const [selectedSeasonId, setSelectedSeasonIdState] = useState<number | null>(
    params.seasonId ?? null,
  );
  const [isRanked, setIsRanked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isRankedLocked = selectedSeasonId != null;

  // TODO: derive ranked status from the selected season or league policy.
  useEffect(() => {
    if (selectedSeasonId != null) setIsRanked(true);
  }, [selectedSeasonId]);

  const setSelectedSeasonId = useCallback((seasonId: number | null) => {
    setSelectedSeasonIdState(seasonId);
    if (seasonId != null) setIsRanked(true);
  }, []);

  const setRanked = useCallback((value: boolean) => {
    if (selectedSeasonId == null) setIsRanked(value);
  }, [selectedSeasonId]);

  const onSubmit = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    await hapticMedium();
    try {
      const session = await api.createSession({
        date,
        start_time: startTime || null,
        court_id: courtId,
        is_ranked: isRankedLocked ? true : isRanked,
        ...(leagueId != null
          ? { league_id: leagueId, season_id: selectedSeasonId }
          : {}),
      });
      if (session == null) throw new Error('Failed to create session.');
      router.replace(routes.session(session.id));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create session.');
    } finally {
      setIsSubmitting(false);
    }
  }, [courtId, date, isRanked, isRankedLocked, leagueId, router, selectedSeasonId, startTime]);

  return {
    date,
    startTime,
    courtId,
    leagueName: league?.name ?? null,
    leagueSeasons: leagueSeasons ?? [],
    selectedSeasonId,
    showsSeasonAssignment: leagueId != null,
    isRanked,
    isRankedLocked,
    isSubmitting,
    submitError,
    setDate,
    setStartTime,
    setCourtId,
    setSelectedSeasonId,
    setIsRanked: setRanked,
    onSubmit,
  };
}
