/** Data and submission state for creating a session. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LeagueDetail, Location, Season } from '@beach-kings/shared';

import useApi from '@/hooks/useApi';
import { api } from '@/lib/api';
import { routes } from '@/lib/navigation';
import { hapticMedium } from '@/utils/haptics';
import { useAuth } from '@/contexts/AuthContext';
import { reconcileGameMutation } from '@/features/matches';
import { formatLocalCalendarDate } from '@/lib/calendarDate';
import { useCurrentPlayer } from '@/hooks/useCurrentPlayer';
import { playerQueries, usePlayerProfileMutations } from '@/features/player';
import { courtQueries } from '@/features/courts';

interface UseSessionCreateScreenParams {
  readonly leagueId?: number | null;
  readonly seasonId?: number | null;
  readonly playerIds?: readonly number[];
}

export interface UseSessionCreateScreenResult {
  readonly date: string;
  readonly startTime: string;
  readonly courtId: number | null;
  readonly courtName: string | null;
  readonly courtConfirmed: boolean;
  readonly needsMetro: boolean;
  readonly isSavingMetro: boolean;
  readonly metroError: string | null;
  readonly courtSuggestionError: string | null;
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
  readonly setCourtId: (value: number | null, name?: string | null) => void;
  readonly confirmCourt: () => void;
  readonly saveMetro: (location: Location) => Promise<void>;
  readonly retryCourtSuggestion: () => Promise<void>;
  readonly setSelectedSeasonId: (value: number | null) => void;
  readonly setIsRanked: (value: boolean) => void;
  readonly onSubmit: () => Promise<void>;
}

/** Returns form state and submit handler for creating a new session. */
export function useSessionCreateScreen(
  params: UseSessionCreateScreenParams = {},
): UseSessionCreateScreenResult {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const playerQuery = useCurrentPlayer();
  const player = playerQuery.data ?? null;
  const playerId = player?.id ?? 0;
  const homeCourtsQuery = useQuery(
    playerQueries.homeCourts(userId, playerId, playerId > 0),
  );
  const orderedHomeCourts = useMemo(
    () => [...(homeCourtsQuery.data ?? [])].sort((a, b) => a.position - b.position),
    [homeCourtsQuery.data],
  );
  const placeholderQuery = useQuery(courtQueries.placeholder(
    userId,
    player?.location_id ?? null,
    homeCourtsQuery.isSuccess && orderedHomeCourts.length === 0,
  ));
  const { updateProfile } = usePlayerProfileMutations();
  const leagueId = params.leagueId ?? null;
  const playerIds = useMemo(
    () =>
      [...new Set(params.playerIds ?? [])]
        .filter((id) => Number.isInteger(id) && id > 0)
        .slice(0, 4),
    [params.playerIds],
  );
  const createdSessionIdRef = useRef<number | null>(null);
  const today = formatLocalCalendarDate();
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
  const [courtName, setCourtName] = useState<string | null>(null);
  const [courtConfirmed, setCourtConfirmed] = useState(false);
  const [metroError, setMetroError] = useState<string | null>(null);
  const courtSelectionTouchedRef = useRef(false);
  const [selectedSeasonId, setSelectedSeasonIdState] = useState<number | null>(
    params.seasonId ?? null,
  );
  const [isRanked, setIsRanked] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isRankedLocked = selectedSeasonId != null;
  const needsMetro =
    player != null &&
    homeCourtsQuery.isSuccess &&
    orderedHomeCourts.length === 0 &&
    !player.location_id;
  const courtSuggestionError = homeCourtsQuery.isError
    ? 'Your home-court suggestion could not be loaded.'
    : homeCourtsQuery.isSuccess &&
        orderedHomeCourts.length === 0 &&
        player?.location_id &&
        placeholderQuery.isError
      ? 'Your metro’s private-court suggestion could not be loaded.'
      : null;

  useEffect(() => {
    courtSelectionTouchedRef.current = false;
    setCourtId(null);
    setCourtName(null);
    setCourtConfirmed(false);
  }, [playerId, userId]);

  useEffect(() => {
    if (courtSelectionTouchedRef.current) return;
    const firstHomeCourt = orderedHomeCourts[0];
    if (firstHomeCourt != null) {
      setCourtId(firstHomeCourt.id);
      setCourtName(firstHomeCourt.name?.trim() || 'Unnamed court');
      return;
    }
    if (homeCourtsQuery.isSuccess && placeholderQuery.data != null) {
      const id = Number(placeholderQuery.data.id);
      if (Number.isInteger(id) && id > 0) {
        setCourtId(id);
        setCourtName(placeholderQuery.data.name);
      }
    }
  }, [homeCourtsQuery.isSuccess, orderedHomeCourts, placeholderQuery.data]);

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

  const selectCourt = useCallback((value: number | null, name?: string | null) => {
    courtSelectionTouchedRef.current = true;
    setCourtId(value);
    setCourtName(name ?? null);
    setCourtConfirmed(value != null);
    setSubmitError(null);
  }, []);

  const confirmCourt = useCallback(() => {
    if (courtId != null) {
      courtSelectionTouchedRef.current = true;
      setCourtConfirmed(true);
      setSubmitError(null);
    }
  }, [courtId]);

  const saveMetro = useCallback(async (location: Location) => {
    setMetroError(null);
    try {
      courtSelectionTouchedRef.current = false;
      setCourtId(null);
      setCourtName(null);
      setCourtConfirmed(false);
      await updateProfile.mutateAsync({
        location_id: location.id,
        city: location.city,
        state: location.state,
      });
    } catch (error) {
      setMetroError(
        error instanceof Error
          ? error.message
          : 'Your metro could not be saved. Please try again.',
      );
    }
  }, [updateProfile]);

  const retryCourtSuggestion = useCallback(async () => {
    const homeResult = await homeCourtsQuery.refetch();
    if ((homeResult.data ?? []).length === 0 && player?.location_id) {
      await placeholderQuery.refetch();
    }
  }, [homeCourtsQuery, placeholderQuery, player?.location_id]);

  const onSubmit = useCallback(async () => {
    setSubmitError(null);
    if (needsMetro) {
      setSubmitError('Choose a metro before starting this session.');
      return;
    }
    if (courtId == null) {
      setSubmitError('Choose a court before starting this session.');
      return;
    }
    if (!courtConfirmed) {
      setSubmitError('Confirm the suggested court before starting this session.');
      return;
    }
    setIsSubmitting(true);
    await hapticMedium();
    try {
      let sessionId = createdSessionIdRef.current;
      if (sessionId == null) {
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
        sessionId = session.id;
        createdSessionIdRef.current = sessionId;
      }
      if (playerIds.length > 0) {
        const inviteResult = await api.inviteSessionPlayers(sessionId, playerIds);
        if (inviteResult.failed.length > 0) {
          throw new Error(
            "The session started, but some selected players couldn't be added. Try again.",
          );
        }
      }
      void reconcileGameMutation(queryClient, { userId, leagueId });
      router.replace(routes.session(sessionId));
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create session.');
    } finally {
      setIsSubmitting(false);
    }
  }, [courtConfirmed, courtId, date, isRanked, isRankedLocked, leagueId, needsMetro, playerIds, queryClient, router, selectedSeasonId, startTime, userId]);

  return {
    date,
    startTime,
    courtId,
    courtName,
    courtConfirmed,
    needsMetro,
    isSavingMetro: updateProfile.isPending,
    metroError,
    courtSuggestionError,
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
    setCourtId: selectCourt,
    confirmCourt,
    saveMetro,
    retryCourtSuggestion,
    setSelectedSeasonId,
    setIsRanked: setRanked,
    onSubmit,
  };
}
