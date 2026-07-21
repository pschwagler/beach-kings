import { waitFor } from '@testing-library/react-native';
import { QueryClient } from '@tanstack/react-query';

const mockGetStatsCalculationStatus = jest.fn();

jest.mock('@/lib/api', () => ({
  api: {
    getStatsCalculationStatus: (...args: unknown[]) =>
      mockGetStatsCalculationStatus(...args),
  },
}));

import { reconcileGameMutation, waitForStatsJobs } from '@/features/matches';
import { playerKeys } from '@/features/player';
import { sessionKeys } from '@/features/sessions';
import { matchKeys } from '@/features/matches';
import { leagueKeys } from '@/components/screens/Leagues/leagueKeys';

describe('game mutation cache reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('polls until every returned stats job completes', async () => {
    mockGetStatsCalculationStatus
      .mockResolvedValueOnce({ status: 'running' })
      .mockResolvedValueOnce({ status: 'completed' });

    await expect(waitForStatsJobs(
      { global_job_id: 41 },
      { intervalMs: 0, maxAttempts: 2 },
    )).resolves.toBe(true);

    expect(mockGetStatsCalculationStatus).toHaveBeenNthCalledWith(1, 41);
    expect(mockGetStatsCalculationStatus).toHaveBeenNthCalledWith(2, 41);
  });

  it('stops polling after the bounded attempt count', async () => {
    mockGetStatsCalculationStatus.mockResolvedValue({ status: 'running' });

    await expect(waitForStatsJobs(
      { global_job_id: 42 },
      { intervalMs: 0, maxAttempts: 2 },
    )).resolves.toBe(false);

    expect(mockGetStatsCalculationStatus).toHaveBeenCalledTimes(2);
  });

  it('refreshes snapshots immediately and totals after job completion', async () => {
    mockGetStatsCalculationStatus.mockResolvedValue({ status: 'completed' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await reconcileGameMutation(queryClient, {
      userId: 7,
      leagueId: 3,
      statsJobs: { global_job_id: 43, league_job_id: 44 },
    });

    const calls = () => invalidate.mock.calls.map(([options]) => ({
      key: JSON.stringify(options?.queryKey),
      refetchType: options?.refetchType,
    }));

    expect(calls()).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: JSON.stringify(sessionKeys.all(7)) }),
      expect.objectContaining({ key: JSON.stringify(matchKeys.all(7)) }),
      expect.objectContaining({ key: JSON.stringify(leagueKeys.myGames(7, 3)) }),
    ]));

    await waitFor(() => {
      expect(calls()).toEqual(expect.arrayContaining([
        {
          key: JSON.stringify(playerKeys.me(7)),
          refetchType: 'active',
        },
        {
          key: JSON.stringify(leagueKeys.league(7, 3)),
          refetchType: 'active',
        },
      ]));
    });
  });
});
