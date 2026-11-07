import type { AxiosInstance } from "axios";
import { getRead, type ReadRequestOptions } from "./readRequest";

export interface ScoresheetPlayer {
  readonly id: number | null;
  readonly name: string;
  readonly rawName: string;
}
export interface ScoresheetMatch {
  readonly number: number;
  readonly players: readonly ScoresheetPlayer[];
  readonly scores: readonly [number | null, number | null];
}
export interface ScoresheetResult {
  readonly status: string;
  readonly matches: readonly ScoresheetMatch[];
  readonly clarification: string | null;
  readonly error: string | null;
}
export interface PhotoMatchJob {
  readonly job_id: number;
  readonly session_id: string;
  readonly status: string;
}
export interface PhotoMatchJobStatus {
  readonly job_id: number;
  readonly status: string;
  readonly result: ScoresheetResult | null;
}
export interface PhotoPlayerOverride {
  readonly raw_name: string;
  readonly player_id: number;
  readonly player_name: string;
}

const fields = [
  "team1_player1",
  "team1_player2",
  "team2_player1",
  "team2_player2",
];
const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value != null
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown): string | null =>
  typeof value === "string" ? value : null;
const id = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
const score = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

/** Interpret the legacy parser's flat fields at the API boundary. */
export function normalizeScoresheetResult(
  value: unknown,
): ScoresheetResult | null {
  if (value == null) return null;
  const data = record(value);
  return {
    status: string(data.status) ?? "unknown",
    clarification: string(data.clarification_question),
    error: string(data.error_message),
    matches: (Array.isArray(data.matches) ? data.matches : []).map(
      (value, index) => {
        const match = record(value);
        return {
          number: index + 1,
          scores: [score(match.team1_score), score(match.team2_score)] as const,
          players: fields.map((field) => {
            const raw = match[field];
            const player = record(raw);
            const rawName = (string(player.name) ?? string(raw) ?? "").trim();
            return {
              id: id(match[`${field}_id`]) ?? id(player.id),
              name:
                string(match[`${field}_matched`])?.trim() ||
                rawName ||
                "Unknown player",
              rawName,
            };
          }),
        };
      },
    ),
  };
}

export function createPhotoMatchMethods(api: AxiosInstance) {
  const base = (leagueId: number | null) =>
    leagueId == null ? "/api/matches" : `/api/leagues/${leagueId}/matches`;
  return {
    async uploadScoresheet(
      leagueId: number | null,
      file: { uri: string; name: string; type: string },
      prompt: string,
      seasonId: number | null,
    ): Promise<PhotoMatchJob> {
      const form = new FormData();
      form.append("file", file as unknown as Blob);
      if (prompt.trim()) form.append("user_prompt", prompt.trim());
      if (seasonId != null) form.append("season_id", String(seasonId));
      const response = await api.post<PhotoMatchJob>(
        `${base(leagueId)}/upload-photo`,
        form,
        { headers: { "Content-Type": undefined }, timeout: 60_000 },
      );
      return response.data;
    },
    async getScoresheetJob(
      leagueId: number | null,
      jobId: number,
      options?: ReadRequestOptions,
    ): Promise<PhotoMatchJobStatus> {
      const { data } = await getRead<{
        job_id: number;
        status: string;
        result: unknown;
      }>(api, `${base(leagueId)}/photo-jobs/${jobId}`, undefined, options);
      return { ...data, result: normalizeScoresheetResult(data.result) };
    },
    async editScoresheet(
      leagueId: number | null,
      sessionId: string,
      prompt: string,
      reviewedMatches?: readonly ScoresheetMatch[],
    ): Promise<PhotoMatchJob> {
      return (
        await api.post<PhotoMatchJob>(
          `${base(leagueId)}/photo-sessions/${encodeURIComponent(sessionId)}/edit`,
          {
            edit_prompt: prompt,
            ...(reviewedMatches !== undefined
              ? { reviewed_matches: reviewedMatches }
              : {}),
          },
          { timeout: 30_000 },
        )
      ).data;
    },
    async confirmScoresheet(
      leagueId: number | null,
      sessionId: string,
      seasonId: number | null,
      date: string,
      overrides: readonly PhotoPlayerOverride[],
    ): Promise<{
      match_ids: number[];
      matches_created: number;
      session_id?: number | null;
    }> {
      return (
        await api.post(
          `${base(leagueId)}/photo-sessions/${encodeURIComponent(sessionId)}/confirm`,
          {
            season_id: seasonId,
            match_date: date,
            player_overrides: overrides,
          },
          { timeout: 30_000 },
        )
      ).data;
    },
  };
}
