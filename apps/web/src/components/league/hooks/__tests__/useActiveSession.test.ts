/**
 * useActiveSession — zero-season guard tests.
 *
 * A league with zero seasons (seasons=[]) must still load its active session
 * and all sessions, because gap games (league matches with no season_id) are
 * valid and require session management to work.
 *
 * Previously the hook guarded with `seasons?.length > 0` which prevented any
 * session loading for zero-season leagues.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('../../../../services/api', () => ({
  getActiveSession: vi.fn(),
  getSessions: vi.fn(),
}));

import { useActiveSession } from '../useActiveSession';
import { getActiveSession, getSessions } from '../../../../services/api';

describe('useActiveSession — zero-season league', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getActiveSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (getSessions as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  it('loads sessions for a league even when seasons is empty', async () => {
    renderHook(() =>
      useActiveSession({
        leagueId: 42,
        selectedSeasonId: null,
        refreshMatchData: null,
        refreshAllSeasonsMatches: null,
      })
    );

    await waitFor(() => {
      expect(getActiveSession).toHaveBeenCalledWith(42);
      expect(getSessions).toHaveBeenCalledWith(42);
    });
  });

  it('does NOT load sessions when leagueId is null (regardless of seasons)', async () => {
    renderHook(() =>
      useActiveSession({
        leagueId: null,
        selectedSeasonId: null,
        refreshMatchData: null,
        refreshAllSeasonsMatches: null,
      })
    );

    // Give async effects a chance to fire
    await new Promise((r) => setTimeout(r, 30));

    expect(getActiveSession).not.toHaveBeenCalled();
    expect(getSessions).not.toHaveBeenCalled();
  });

  it('loads sessions for a league with seasons (existing behaviour preserved)', async () => {
    renderHook(() =>
      useActiveSession({
        leagueId: 7,
        selectedSeasonId: null,
        refreshMatchData: null,
        refreshAllSeasonsMatches: null,
      })
    );

    await waitFor(() => {
      expect(getActiveSession).toHaveBeenCalledWith(7);
      expect(getSessions).toHaveBeenCalledWith(7);
    });
  });

  it('exposes the active session returned by the API', async () => {
    const session = { id: 99, league_id: 42, season_id: null };
    (getActiveSession as ReturnType<typeof vi.fn>).mockResolvedValue(session);

    const { result } = renderHook(() =>
      useActiveSession({
        leagueId: 42,
        selectedSeasonId: null,
        refreshMatchData: null,
        refreshAllSeasonsMatches: null,
      })
    );

    await waitFor(() => {
      expect(result.current.activeSession).toEqual(session);
    });
  });

  it('exposes all sessions returned by the API', async () => {
    const sessions = [{ id: 1 }, { id: 2 }];
    (getSessions as ReturnType<typeof vi.fn>).mockResolvedValue(sessions);

    const { result } = renderHook(() =>
      useActiveSession({
        leagueId: 42,
        selectedSeasonId: null,
        refreshMatchData: null,
        refreshAllSeasonsMatches: null,
      })
    );

    await waitFor(() => {
      expect(result.current.allSessions).toEqual(sessions);
    });
  });
});

describe('useActiveSession — polling for zero-season active gap-game session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls via refreshAllSeasonsMatches when selectedSeasonId is null and an active session exists', async () => {
    const gapSession = { id: 5, league_id: 42, season_id: null };
    (getActiveSession as ReturnType<typeof vi.fn>).mockResolvedValue(gapSession);
    (getSessions as ReturnType<typeof vi.fn>).mockResolvedValue([gapSession]);

    const refreshAllSeasonsMatches = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useActiveSession({
        leagueId: 42,
        selectedSeasonId: null, // all-time / zero-season view
        refreshMatchData: null,
        refreshAllSeasonsMatches,
      })
    );

    // Let the initial load effects settle so activeSession is set
    await act(async () => {
      await Promise.resolve();
    });

    // Advance past the first poll interval
    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(refreshAllSeasonsMatches).toHaveBeenCalled();
  });

  it('polls via refreshMatchData when selectedSeasonId is set and an active session exists', async () => {
    const seasonSession = { id: 6, league_id: 7, season_id: 3 };
    (getActiveSession as ReturnType<typeof vi.fn>).mockResolvedValue(seasonSession);
    (getSessions as ReturnType<typeof vi.fn>).mockResolvedValue([seasonSession]);

    const refreshMatchData = vi.fn().mockResolvedValue(undefined);
    const refreshAllSeasonsMatches = vi.fn().mockResolvedValue(undefined);

    renderHook(() =>
      useActiveSession({
        leagueId: 7,
        selectedSeasonId: 3,
        refreshMatchData,
        refreshAllSeasonsMatches,
      })
    );

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
      await Promise.resolve();
    });

    expect(refreshMatchData).toHaveBeenCalledWith(3);
    expect(refreshAllSeasonsMatches).not.toHaveBeenCalled();
  });
});
