import { queryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { privateKeys } from "@/infrastructure/query/keys";
import { leagueKeys } from "@/features/leagues";

export const scoresheetKeys = {
  root: (userId: number) =>
    [...privateKeys.user(userId), "scoresheets"] as const,
  job: (userId: number, leagueId: number, jobId: number | null) =>
    [...scoresheetKeys.root(userId), leagueId, "job", jobId] as const,
};
export const scoresheetQueries = {
  leagues: (userId: number) =>
    queryOptions({
      queryKey: leagueKeys.userLeagues(userId),
      queryFn: ({ signal }) => api.getUserLeagues({ signal }),
      enabled: userId > 0,
      staleTime: 30_000,
    }),
  seasons: (userId: number, leagueId: number) =>
    queryOptions({
      queryKey: leagueKeys.seasons(userId, leagueId),
      queryFn: () => api.getLeagueSeasons(leagueId),
      enabled: userId > 0 && leagueId > 0,
    }),
  job: (userId: number, leagueId: number, jobId: number | null) =>
    queryOptions({
      queryKey: scoresheetKeys.job(userId, leagueId, jobId),
      queryFn: ({ signal }) =>
        api.getScoresheetJob(leagueId, jobId!, { signal }),
      enabled: userId > 0 && leagueId > 0 && jobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "COMPLETED" ||
          status === "FAILED" ||
          query.state.status === "error"
          ? false
          : 2000;
      },
      retry: 2,
    }),
};
