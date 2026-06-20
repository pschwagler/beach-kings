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
import { renderHook, waitFor } from '@testing-library/react';

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
        seasons: [], // zero seasons — gap-game league
        selectedSeasonId: null,
        refreshMatchData: null,
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
        seasons: [],
        selectedSeasonId: null,
        refreshMatchData: null,
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
        seasons: [{ id: 1, name: 'Season 1' }],
        selectedSeasonId: null,
        refreshMatchData: null,
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
        seasons: [],
        selectedSeasonId: null,
        refreshMatchData: null,
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
        seasons: [],
        selectedSeasonId: null,
        refreshMatchData: null,
      })
    );

    await waitFor(() => {
      expect(result.current.allSessions).toEqual(sessions);
    });
  });
});
