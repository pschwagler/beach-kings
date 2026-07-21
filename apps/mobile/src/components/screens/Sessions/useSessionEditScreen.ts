/** Data and submission state for editing a session. */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Season, SessionDetail } from '@beach-kings/shared';

import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { hapticMedium } from '@/utils/haptics';
import { useAuth } from '@/contexts/AuthContext';
import { reconcileGameMutation } from '@/features/matches';
import { sessionQueries } from '@/features/sessions';

export interface UseSessionEditScreenResult {
  readonly session: SessionDetail | null;
  readonly isLoading: boolean;
  readonly date: string;
  readonly startTime: string;
  readonly courtId: number | null;
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
  readonly onSave: () => Promise<void>;
  readonly onCancel: () => void;
}

/** Returns pre-populated form state and save handler for editing a session. */
export function useSessionEditScreen(sessionId: number): UseSessionEditScreenResult {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const { data: session, isLoading } = useQuery(
    sessionQueries.detail(userId, sessionId),
  );
  const leagueId = session?.league_id ?? null;
  const { data: leagueSeasons } = useApi<Season[]>(
    () => api.getLeagueSeasons(Number(leagueId)),
    [leagueId],
    { enabled: leagueId != null },
  );

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [courtId, setCourtId] = useState<number | null>(null);
  const [selectedSeasonId, setSelectedSeasonIdState] = useState<number | null>(null);
  const [isRanked, setIsRanked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isRankedLocked = selectedSeasonId != null;

  useEffect(() => {
    if (session == null) return;
    setDate(session.date);
    setStartTime(session.start_time ?? '');
    setCourtId(session.court_id);
    setSelectedSeasonIdState(session.season_id ?? null);
    setIsRanked(session.is_ranked);
  }, [session]);

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

  const onSave = useCallback(async () => {
    setSubmitError(null);
    setIsSubmitting(true);
    await hapticMedium();
    try {
      await api.updateSession(sessionId, {
        date,
        start_time: startTime || null,
        court_id: courtId,
        is_ranked: isRankedLocked ? true : isRanked,
        ...(leagueId != null ? { season_id: selectedSeasonId } : {}),
      });
      void reconcileGameMutation(queryClient, { userId, leagueId });
      router.back();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save changes.');
    } finally {
      setIsSubmitting(false);
    }
  }, [courtId, date, isRanked, isRankedLocked, leagueId, queryClient, router, selectedSeasonId, sessionId, startTime, userId]);

  return {
    session: session ?? null,
    isLoading,
    date,
    startTime,
    courtId,
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
    onSave,
    onCancel: () => router.back(),
  };
}
