import type { QueryClient } from '@tanstack/react-query';
import type { StatsJobIds } from '@beach-kings/shared';
import { api } from '@/lib/api';
import { leagueKeys } from '@/components/screens/Leagues/leagueKeys';
import { playerKeys } from '@/features/player';
import { sessionKeys } from '@/features/sessions';
import { matchKeys } from './keys';

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_MAX_POLL_ATTEMPTS = 20;

interface MutationCacheContext {
  readonly userId: number;
  readonly leagueId?: number | null;
  readonly statsJobs?: StatsJobIds | null;
}

interface StatsPollOptions {
  readonly intervalMs?: number;
  readonly maxAttempts?: number;
}

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

function uniqueJobIds(jobs: StatsJobIds | null | undefined): readonly number[] {
  return [...new Set(
    [jobs?.global_job_id, jobs?.league_job_id].filter(
      (jobId): jobId is number => typeof jobId === 'number' && jobId > 0,
    ),
  )];
}

/** Polls only long enough to bridge the normal async stats-calculation delay. */
export async function waitForStatsJobs(
  jobs: StatsJobIds,
  options: StatsPollOptions = {},
): Promise<boolean> {
  const jobIds = uniqueJobIds(jobs);
  if (jobIds.length === 0) return true;

  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      const statuses = await Promise.all(
        jobIds.map((jobId) => api.getStatsCalculationStatus(jobId)),
      );
      if (statuses.some((job) => job.status === 'failed')) return false;
      if (statuses.every((job) => job.status === 'completed')) return true;
    } catch {
      // Polling is best-effort; the next attempt can recover from a brief
      // connection failure without turning the successful write into an error.
    }

    if (attempt < maxAttempts - 1) await sleep(intervalMs);
  }

  return false;
}

async function invalidateImmediateData(
  queryClient: QueryClient,
  context: MutationCacheContext,
): Promise<void> {
  const requests = [
    queryClient.invalidateQueries({ queryKey: sessionKeys.all(context.userId) }),
    queryClient.invalidateQueries({ queryKey: matchKeys.all(context.userId) }),
  ];
  if (context.leagueId != null) {
    requests.push(queryClient.invalidateQueries({
      queryKey: leagueKeys.userLeagues(context.userId),
    }));
    requests.push(queryClient.invalidateQueries({
      queryKey: leagueKeys.myGames(context.userId, context.leagueId),
    }));
    requests.push(queryClient.invalidateQueries({
      queryKey: leagueKeys.allGames(context.userId, context.leagueId),
    }));
  }
  await Promise.all(requests);
}

async function invalidateDerivedStats(
  queryClient: QueryClient,
  context: MutationCacheContext,
  completed: boolean,
): Promise<void> {
  const refetchType = completed ? 'active' : 'none';
  const requests = [
    queryClient.invalidateQueries({
      queryKey: playerKeys.me(context.userId),
      refetchType,
    }),
    queryClient.invalidateQueries({
      queryKey: matchKeys.all(context.userId),
      refetchType,
    }),
  ];
  if (context.leagueId != null) {
    requests.push(queryClient.invalidateQueries({
      queryKey: leagueKeys.league(context.userId, context.leagueId),
      refetchType,
    }));
    requests.push(queryClient.invalidateQueries({
      queryKey: leagueKeys.userLeagues(context.userId),
      refetchType,
    }));
  }
  await Promise.all(requests);
}

/**
 * Reconciles every cache affected by a game/session write. Session and game
 * snapshots refresh immediately. Player and league totals refresh only after
 * the backend's derived-stat jobs finish.
 */
export async function reconcileGameMutation(
  queryClient: QueryClient,
  context: MutationCacheContext,
): Promise<void> {
  try {
    await invalidateImmediateData(queryClient, context);
  } catch {
    // The server write already succeeded. A failed background refetch must not
    // surface as a failed save; focus/reconnect refresh remains a fallback.
  }

  const jobs = context.statsJobs;
  if (uniqueJobIds(jobs).length === 0) return;

  void waitForStatsJobs(jobs ?? {})
    .then((completed) => invalidateDerivedStats(queryClient, context, completed))
    .catch(() => undefined);
}
