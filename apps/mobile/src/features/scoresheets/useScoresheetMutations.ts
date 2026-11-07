import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  PhotoPlayerOverride,
  ScoresheetMatch,
} from "@beach-kings/api-client";
import { api } from "@/lib/api";
import { leagueKeys } from "@/features/leagues";
import { sessionKeys } from "@/features/sessions";
import { matchKeys } from "@/features/matches";
import { playerKeys } from "@/features/player/keys";
import { statsKeys } from "@/features/stats/keys";
import { useAuth } from "@/contexts/AuthContext";

export function useScoresheetMutations(userId: number, leagueId: number) {
  const client = useQueryClient();
  const { user } = useAuth();
  const requireIdentity = () => {
    if (userId <= 0 || user?.id !== userId)
      throw new Error("Sign in to continue.");
  };
  const upload = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: {
      file: { uri: string; name: string; type: string };
      prompt: string;
      seasonId: number | null;
    }) => {
      requireIdentity();
      return api.uploadScoresheet(
        leagueId || null,
        input.file,
        input.prompt,
        input.seasonId,
      );
    },
  });
  const edit = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: {
      sessionId: string;
      prompt: string;
      matches: readonly ScoresheetMatch[];
    }) => {
      requireIdentity();
      return api.editScoresheet(
        leagueId || null,
        input.sessionId,
        input.prompt,
        input.matches,
      );
    },
  });
  const confirm = useMutation({
    retry: false,
    networkMode: "always",
    mutationFn: (input: {
      sessionId: string;
      seasonId: number | null;
      date: string;
      overrides: readonly PhotoPlayerOverride[];
    }) => {
      requireIdentity();
      return api.confirmScoresheet(
        leagueId || null,
        input.sessionId,
        input.seasonId,
        input.date,
        input.overrides,
      );
    },
    // A batch affects sessions, games, league counts, and personal stats.
    onSuccess: () => {
      for (const queryKey of [
        leagueKeys.root(userId),
        sessionKeys.all(userId),
        matchKeys.all(userId),
        playerKeys.all(userId),
        statsKeys.root(userId),
      ]) {
        void client.invalidateQueries({ queryKey });
      }
    },
  });
  return { upload, edit, confirm };
}
