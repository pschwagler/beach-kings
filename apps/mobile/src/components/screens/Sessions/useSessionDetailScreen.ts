/**
 * Data hook for the Session Detail (active + submitted) screen.
 *
 * Fetches session detail by id, exposes menu state, and submit session handler.
 */

import { useState, useCallback, useRef } from "react";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useRefreshOnFocus from "@/hooks/useRefreshOnFocus";
import { api } from "@/lib/api";
import { hapticMedium, hapticLight } from "@/utils/haptics";
import { routes } from "@/lib/navigation";
import { formatSessionSubtitle } from "@/lib/formatters";
import type { SessionDetail, SessionGame } from "@beach-kings/shared";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentPlayer } from "@/hooks/useCurrentPlayer";
import {
  sessionMutationOptions,
  sessionQueries,
} from "@/features/sessions";
import { reconcileGameMutation } from "@/features/matches";

export interface UseSessionDetailScreenResult {
  readonly session: SessionDetail | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly isRefreshing: boolean;
  readonly isMenuOpen: boolean;
  readonly isSubmitting: boolean;
  readonly submitError: string | null;
  readonly isUpdatingCourt: boolean;
  readonly courtUpdateError: string | null;
  /** Display name of the authenticated user, used to derive per-game team membership. */
  readonly currentPlayerName: string | null;
  readonly onRefresh: () => void;
  readonly onRetry: () => void;
  readonly openMenu: () => void;
  readonly closeMenu: () => void;
  readonly onAddGame: () => void;
  /** Open the score screen in edit mode for the given game. */
  readonly onEditGame: (game: SessionGame) => void;
  readonly onSubmitSession: () => Promise<void>;
  readonly onCourtChange: (
    courtId: number | null,
    courtName?: string | null,
  ) => Promise<void>;
  readonly onClearSubmitError: () => void;
}

/**
 * Returns session detail data + actions for the session detail screen.
 * @param sessionId - numeric session id from route params
 */
export function useSessionDetailScreen(
  sessionId: number,
): UseSessionDetailScreenResult {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const currentPlayer = useCurrentPlayer();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [courtUpdateError, setCourtUpdateError] = useState<string | null>(null);
  const currentPlayerName =
    currentPlayer.data?.full_name ?? currentPlayer.data?.name ?? null;

  const { data, isLoading, error, refetch } = useQuery(
    sessionQueries.detail(userId, sessionId),
  );
  const updateCourt = useMutation(
    sessionMutationOptions.updateCourt(sessionId),
  );

  // Refresh on focus so returning from score-game (after a save / edit /
  // delete) reflects the new game list without a manual pull-to-refresh.
  const refreshOnFocus = useCallback(async () => {
    await refetch();
  }, [refetch]);
  useRefreshOnFocus(refreshOnFocus);

  // Mirror `data` into a ref so `onAddGame` (and similar callbacks) can read the
  // latest session without re-creating their identity on every refetch. The
  // assignment runs during render so the ref reflects the current render's data
  // by the time any event handler fires.
  const dataRef = useRef<SessionDetail | null>(null);
  dataRef.current = data ?? null;

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    refetch().finally(() => {
      setIsRefreshing(false);
    });
  }, [refetch]);

  const onRetry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const openMenu = useCallback(() => {
    void hapticLight();
    setIsMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const onAddGame = useCallback(() => {
    void hapticMedium();
    const session = dataRef.current;
    const sessionLabel =
      session != null
        ? formatSessionSubtitle(
            session.date,
            session.court_name,
            session.league_name,
          )
        : null;
    const gameNumber = session != null ? session.games.length + 1 : null;
    router.push(
      routes.scoreGame({
        sessionId,
        leagueId: session?.league_id ?? null,
        gameNumber,
        sessionLabel,
      }) as never,
    );
  }, [router, sessionId]);

  const onEditGame = useCallback(
    (game: SessionGame) => {
      void hapticMedium();
      const session = dataRef.current;
      const sessionLabel =
        session != null
          ? formatSessionSubtitle(
              session.date,
              session.court_name,
              session.league_name,
            )
          : null;
      router.push(
        routes.scoreGame({
          sessionId,
          leagueId: session?.league_id ?? null,
          matchId: game.id,
          gameNumber: game.game_number,
          sessionLabel,
          headerTitle: "Edit Game",
        }) as never,
      );
    },
    [router, sessionId],
  );

  const onSubmitSession = useCallback(async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    await hapticMedium();
    try {
      const response = await api.lockInSession(sessionId);
      const leagueId = dataRef.current?.league_id;
      await reconcileGameMutation(queryClient, {
        userId,
        leagueId,
        statsJobs: response,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not submit session. Please try again.";
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [sessionId, queryClient, userId]);

  const onCourtChange = useCallback(async (
    courtId: number | null,
    courtName: string | null = null,
  ) => {
    setCourtUpdateError(null);
    const queryKey = sessionQueries.detail(userId, sessionId).queryKey;
    const previous = queryClient.getQueryData<SessionDetail>(queryKey);
    queryClient.setQueryData<SessionDetail>(queryKey, (current) =>
      current == null
        ? current
        : { ...current, court_id: courtId, court_name: courtName },
    );

    try {
      await updateCourt.mutateAsync(courtId);
      await reconcileGameMutation(queryClient, {
        userId,
        leagueId: dataRef.current?.league_id,
      });
    } catch (err) {
      queryClient.setQueryData(queryKey, previous);
      setCourtUpdateError(
        err instanceof Error
          ? err.message
          : "Could not update the court. Please try again.",
      );
    }
  }, [queryClient, sessionId, updateCourt, userId]);

  const onClearSubmitError = useCallback(() => {
    setSubmitError(null);
  }, []);

  return {
    session: data ?? null,
    isLoading,
    error,
    isRefreshing,
    isMenuOpen,
    isSubmitting,
    submitError,
    isUpdatingCourt: updateCourt.isPending,
    courtUpdateError,
    currentPlayerName,
    onRefresh,
    onRetry,
    openMenu,
    closeMenu,
    onAddGame,
    onEditGame,
    onSubmitSession,
    onCourtChange,
    onClearSubmitError,
  };
}
