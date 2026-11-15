import { useMemo, useRef, useState } from "react";
import type * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import type {
  PhotoMatchJob,
  ScoresheetMatch,
  PhotoPlayerOverride,
} from "@beach-kings/api-client";
import { leagueQueries } from "@/features/leagues";
import { useAuth } from "@/contexts/AuthContext";
import { scoresheetQueries } from "@/features/scoresheets/queries";
import { useScoresheetMutations } from "@/features/scoresheets/useScoresheetMutations";
import {
  resolveScoresheetMatches,
  scoresheetReviewIssue,
} from "@/features/scoresheets/review";
import { formatLocalCalendarDate } from "@/lib/calendarDate";
import { getApiErrorMessage } from "@/lib/apiError";

import { pickScoresheetPhoto } from "./pickScoresheetPhoto";

export function useScoresheetScreen(initialLeagueId: number | null) {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const [leagueId, setLeagueId] = useState(initialLeagueId ?? 0);
  const [gameType, setGameType] = useState<"league" | "pickup" | null>(
    initialLeagueId != null ? "league" : null,
  );
  const contextReady =
    gameType === "pickup" || (gameType === "league" && leagueId > 0);
  const [seasonChoice, setSeasonChoice] = useState<{
    id: number | null;
  } | null>(null);
  const [courtId, setCourtId] = useState<number | null>(null);
  const [courtName, setCourtName] = useState<string | null>(null);
  const [gameEdits, setGameEdits] = useState<
    Readonly<Record<number, ScoresheetMatch>>
  >({});
  const [selectedIds, setSelectedIds] = useState<readonly number[]>([]);
  const [manualChoices, setManualChoices] = useState<
    readonly PhotoPlayerOverride[]
  >([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [date, setDate] = useState(() => formatLocalCalendarDate());
  const [photo, setPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [job, setJob] = useState<PhotoMatchJob | null>(null);
  const [overrides, setOverrides] = useState<readonly PhotoPlayerOverride[]>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const actionLock = useRef(false);
  const leagues = useQuery(scoresheetQueries.leagues(userId));
  const league = leagues.data?.find((item) => item.id === leagueId);
  const leagueDetail = useQuery(leagueQueries.detail(userId, leagueId));
  const seasons = useQuery(scoresheetQueries.seasons(userId, leagueId));
  const seasonId =
    seasonChoice != null
      ? seasonChoice.id
      : leagueDetail.data != null
        ? (leagueDetail.data.current_season_id ?? null)
        : (league?.current_season_id ?? null);
  const jobQuery = useQuery(
    scoresheetQueries.job(userId, leagueId, job?.job_id ?? null),
  );
  const mutations = useScoresheetMutations(userId, leagueId);
  const busy =
    picking ||
    mutations.upload.isPending ||
    mutations.edit.isPending ||
    mutations.confirm.isPending;
  const processing =
    job != null &&
    !jobQuery.isError &&
    jobQuery.data?.status !== "COMPLETED" &&
    jobQuery.data?.status !== "FAILED";
  const result = jobQuery.data?.result;
  const matches = useMemo(
    () =>
      resolveScoresheetMatches(
        (result?.matches ?? []).map(
          (match) => gameEdits[match.number] ?? match,
        ),
        overrides,
      ),
    [result, overrides, gameEdits],
  );
  const issue = scoresheetReviewIssue(matches);
  const unresolved = useMemo(
    () => [
      ...new Set(
        matches.flatMap((match) =>
          match.players
            .filter((player) => player.id == null && player.rawName)
            .map((player) => player.rawName),
        ),
      ),
    ],
    [matches],
  );

  const chooseLeague = (id: number) => {
    setGameType(id > 0 ? "league" : "pickup");
    setLeagueId(id);
    setSeasonChoice(null);
  };
  const chooseGameType = (type: "league" | "pickup") => {
    if (job || busy) return;
    setGameType(type);
    if (type === "pickup") {
      setLeagueId(0);
      setSeasonChoice(null);
    }
  };
  const choosePhoto = async (
    camera: boolean,
  ): Promise<"selected" | "cancelled" | "error"> => {
    if (busy || actionLock.current) return "cancelled";
    actionLock.current = true;
    setPicking(true);
    setError(null);
    try {
      const asset = await pickScoresheetPhoto(camera);
      if (asset == null) return "cancelled";
      setPhoto(asset);
      return "selected";
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Could not open the camera or photo library. Please try again.",
        ),
      );
      return "error";
    } finally {
      actionLock.current = false;
      setPicking(false);
    }
  };
  const upload = async () => {
    if (photo == null || !contextReady || busy || actionLock.current) return;
    actionLock.current = true;
    setError(null);
    try {
      const next = await mutations.upload.mutateAsync({
        file: {
          uri: photo.uri,
          name: photo.fileName ?? "scoresheet.jpg",
          type: photo.mimeType ?? "image/jpeg",
        },
        prompt,
        seasonId,
      });
      setJob(next);
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Could not upload this photo. Please try again.",
        ),
      );
    } finally {
      actionLock.current = false;
    }
  };
  const edit = async () => {
    if (
      !job ||
      !editPrompt.trim() ||
      editorOpen ||
      busy ||
      processing ||
      actionLock.current
    )
      return;
    actionLock.current = true;
    setError(null);
    try {
      const next = await mutations.edit.mutateAsync({
        sessionId: job.session_id,
        prompt: editPrompt.trim(),
        matches,
      });
      setJob(next);
      setOverrides([]);
      setGameEdits({});
      setEditPrompt("");
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Could not apply the correction. Please try again.",
        ),
      );
    } finally {
      actionLock.current = false;
    }
  };
  const confirm = async () => {
    if (
      !job ||
      editorOpen ||
      issue ||
      processing ||
      jobQuery.data?.status !== "COMPLETED" ||
      busy ||
      actionLock.current
    )
      return;
    actionLock.current = true;
    setError(null);
    try {
      await mutations.confirm.mutateAsync({
        sessionId: job.session_id,
        seasonId: leagueId > 0 ? seasonId : null,
        date,
        overrides,
        matches,
        courtId,
      });
    } catch (error) {
      setError(
        getApiErrorMessage(error, "Could not add games. Please try again."),
      );
    } finally {
      actionLock.current = false;
    }
  };
  const resolve = (
    raw_name: string,
    player_id: number,
    player_name: string,
  ) => {
    const previousChoice = manualChoices.find(
      (item) => item.raw_name.toLowerCase() === raw_name.toLowerCase(),
    );
    setGameEdits((previous) => ({
      ...previous,
      ...Object.fromEntries(
        matches.map((match) => [
          match.number,
          {
            ...match,
            players: match.players.map((player) => {
              const sameName =
                player.rawName.toLowerCase() === raw_name.toLowerCase() ||
                (!player.rawName && player.id === previousChoice?.player_id);
              return sameName &&
                (player.id == null || player.id === previousChoice?.player_id)
                ? { ...player, id: player_id, name: player_name }
                : player;
            }),
          },
        ]),
      ),
    }));
    setManualChoices((previous) => [
      ...previous.filter(
        (item) => item.raw_name.toLowerCase() !== raw_name.toLowerCase(),
      ),
      { raw_name, player_id, player_name },
    ]);
    setSelectedIds((previous) => [...new Set([...previous, player_id])]);
    setOverrides((previous) => [
      ...previous.filter(
        (item) => item.raw_name.toLowerCase() !== raw_name.toLowerCase(),
      ),
      { raw_name, player_id, player_name },
    ]);
  };
  const editGame = (match: ScoresheetMatch, ids: readonly number[]) => {
    setGameEdits((previous) => ({ ...previous, [match.number]: match }));
    setSelectedIds((previous) => [...new Set([...previous, ...ids])]);
  };
  const restart = () => {
    setJob(null);
    setOverrides([]);
    setGameEdits({});
    setSelectedIds([]);
    setManualChoices([]);
    setEditorOpen(false);
    setError(null);
    mutations.confirm.reset();
  };
  return {
    leagues,
    league,
    leagueId,
    chooseLeague,
    gameType,
    chooseGameType,
    contextReady,
    seasons,
    seasonId,
    setSeasonId: (id: number | null) => setSeasonChoice({ id }),
    date,
    setDate,
    courtId,
    courtName,
    setCourt: (id: number | null, name?: string | null) => {
      setCourtId(id);
      setCourtName(name ?? null);
    },
    editGame,
    selectedIds,
    manualChoices,
    editorOpen,
    setEditorOpen,
    photo,
    prompt,
    setPrompt,
    editPrompt,
    setEditPrompt,
    choosePhoto,
    job,
    jobQuery,
    result,
    matches,
    unresolved,
    resolve,
    issue,
    busy,
    picking,
    processing,
    error,
    upload,
    edit,
    confirm,
    restart,
    uploaded: job != null,
    confirmed: mutations.confirm.isSuccess,
    savedCount: mutations.confirm.data?.matches_created ?? 0,
    savedSessionId: mutations.confirm.data?.session_id ?? null,
    uploading: mutations.upload.isPending,
    confirming: mutations.confirm.isPending,
  };
}
