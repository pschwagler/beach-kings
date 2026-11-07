import { useMemo, useRef, useState } from "react";
import { Alert, Linking } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useQuery } from "@tanstack/react-query";
import type {
  PhotoMatchJob,
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
    () => resolveScoresheetMatches(result?.matches ?? [], overrides),
    [result, overrides],
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
  const choosePhoto = async (camera: boolean) => {
    if (busy || actionLock.current) return;
    actionLock.current = true;
    setPicking(true);
    setError(null);
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Camera access needed",
            "Allow camera access in Settings to photograph a scoresheet, or choose a photo from your library.",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Open Settings",
                onPress: () => {
                  void Linking.openSettings();
                },
              },
            ],
          );
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false,
      };
      const picked = camera
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
      if (picked.canceled) return;
      const asset = picked.assets[0];
      if (asset == null)
        throw new Error("The photo could not be read. Please choose it again.");
      if (asset.fileSize != null && asset.fileSize > 10 * 1024 * 1024)
        throw new Error("Choose a photo smaller than 10 MB.");
      if (
        asset.mimeType &&
        !["image/jpeg", "image/png", "image/heic", "image/heif"].includes(
          asset.mimeType,
        )
      ) {
        throw new Error("Choose a JPEG, PNG, or HEIC photo.");
      }
      setPhoto(asset);
    } catch (error) {
      setError(
        getApiErrorMessage(
          error,
          "Could not open the camera or photo library. Please try again.",
        ),
      );
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
    if (!job || !editPrompt.trim() || busy || processing || actionLock.current)
      return;
    actionLock.current = true;
    setError(null);
    try {
      const next = await mutations.edit.mutateAsync({
        sessionId: job.session_id,
        prompt: editPrompt.trim(),
      });
      setJob(next);
      setOverrides([]);
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
    setOverrides((previous) => [
      ...previous.filter(
        (item) => item.raw_name.toLowerCase() !== raw_name.toLowerCase(),
      ),
      { raw_name, player_id, player_name },
    ]);
  };
  const restart = () => {
    setJob(null);
    setOverrides([]);
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
