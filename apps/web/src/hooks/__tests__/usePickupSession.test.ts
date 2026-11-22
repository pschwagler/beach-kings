import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  getSessionByCode: vi.fn(),
  getSessionMatches: vi.fn(),
  getSessionParticipants: vi.fn(),
  getSharedSessionPreview: vi.fn(),
  joinSessionByCode: vi.fn(),
}));

vi.mock('../../components/league/utils/matchUtils', () => ({
  sessionMatchToDisplayFormat: vi.fn((m) => ({ ...m, transformed: true })),
  buildPlaceholderIdSet: vi.fn(() => new Set()),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ currentUserPlayer: { id: 1 }, isAuthenticated: true })),
}));

vi.mock('../../contexts/AppContext', () => ({
  useApp: vi.fn(() => ({ userLeagues: [] })),
}));

import { usePickupSession } from '../usePickupSession';
import {
  getSessionByCode,
  getSessionMatches,
  getSessionParticipants,
  getSharedSessionPreview,
  joinSessionByCode,
} from '../../services/api';
import { sessionMatchToDisplayFormat } from '../../components/league/utils/matchUtils';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('usePickupSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ currentUserPlayer: { id: 1 }, isAuthenticated: true });
    useApp.mockReturnValue({ userLeagues: [] });
  });

  describe('no code provided', () => {
    it('sets loading to false and makes no API calls when code is falsy', async () => {
      const { result } = renderHook(() => usePickupSession(undefined));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(getSessionByCode).not.toHaveBeenCalled();
    });
  });

  it('loads anonymous contents through the shared code without protected ID reads', async () => {
    useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false });
    const session = { id: 10, code: 'ABC', league_id: 7, status: 'ACTIVE' };
    getSharedSessionPreview.mockResolvedValue({ session, matches: [{ id: 1 }], participants: [{ player_id: 2, full_name: 'Test Player' }] });
    const { result } = renderHook(() => usePickupSession('ABC'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toEqual(session);
    expect(result.current.matches).toEqual([{ id: 1 }]);
    expect(result.current.isCreator).toBe(false);
    expect(getSessionByCode).not.toHaveBeenCalled();
    expect(getSessionMatches).not.toHaveBeenCalled();
    expect(getSessionParticipants).not.toHaveBeenCalled();
    expect(joinSessionByCode).not.toHaveBeenCalled();
  });

  it('waits for auth initialization before choosing the read endpoint', async () => {
    useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false, isInitializing: true });
    renderHook(() => usePickupSession('ABC'));
    expect(getSharedSessionPreview).not.toHaveBeenCalled();
    expect(getSessionByCode).not.toHaveBeenCalled();
  });

  it('reloads authenticated contents after login on the same session', async () => {
    useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false });
    getSharedSessionPreview.mockResolvedValue({ session: { id: 10, name: 'Shared' }, matches: [], participants: [] });
    const { result, rerender } = renderHook(() => usePickupSession('ABC'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    getSessionByCode.mockResolvedValue({ id: 10, created_by: 7 });
    getSessionMatches.mockResolvedValue([{ id: 101 }]);
    getSessionParticipants.mockResolvedValue([{ player_id: 7, full_name: 'Test Player' }]);
    useAuth.mockReturnValue({ currentUserPlayer: { id: 7 }, isAuthenticated: true });
    rerender();
    await waitFor(() => expect(result.current.isCreator).toBe(true));
    expect(result.current.matches).toEqual([{ id: 101 }]);
    expect(getSessionByCode).toHaveBeenCalledWith('ABC');
    expect(getSessionMatches).toHaveBeenCalledWith(10);
  });

  it('ignores a guest preview that arrives after authenticated contents', async () => {
    const guest = deferred<any>();
    useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false });
    getSharedSessionPreview.mockReturnValue(guest.promise);
    const { result, rerender } = renderHook(() => usePickupSession('ABC'));
    const ownedSession = { id: 10, code: 'ABC', created_by: 7 };
    getSessionByCode.mockResolvedValue(ownedSession);
    getSessionMatches.mockResolvedValue([{ id: 101 }]);
    getSessionParticipants.mockResolvedValue([{ player_id: 7, full_name: 'Test Player' }]);
    useAuth.mockReturnValue({ currentUserPlayer: { id: 7 }, isAuthenticated: true });
    rerender();
    await waitFor(() => expect(result.current.isCreator).toBe(true));

    await act(async () => guest.resolve({ session: { id: 10, code: 'ABC' }, matches: [], participants: [] }));

    expect(result.current.session).toEqual(ownedSession);
    expect(result.current.isCreator).toBe(true);
    expect(result.current.matches).toEqual([{ id: 101 }]);
  });

  it('does not let a stale guest failure stop the authenticated loading state', async () => {
    const guest = deferred<any>();
    const authenticated = deferred<any>();
    useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false });
    getSharedSessionPreview.mockReturnValue(guest.promise);
    const { result, rerender } = renderHook(() => usePickupSession('ABC'));
    getSessionByCode.mockReturnValue(authenticated.promise);
    getSessionMatches.mockResolvedValue([]);
    getSessionParticipants.mockResolvedValue([]);
    useAuth.mockReturnValue({ currentUserPlayer: { id: 7 }, isAuthenticated: true });
    rerender();

    await act(async () => guest.reject(new Error('Old preview failed')));

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await act(async () => authenticated.resolve({ id: 10, created_by: 7 }));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isCreator).toBe(true);
  });

  it('does not join or load private contents after logout invalidates an old lookup', async () => {
    const authenticated = deferred<any>();
    getSessionByCode.mockReturnValue(authenticated.promise);
    const { result, rerender } = renderHook(() => usePickupSession('ABC'));
    useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false });
    const preview = { id: 10, code: 'ABC', status: 'ACTIVE' };
    getSharedSessionPreview.mockResolvedValue({ session: preview, matches: [], participants: [] });
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => authenticated.resolve({ id: 10, created_by: 2, status: 'ACTIVE', league_id: null }));

    expect(result.current.session).toEqual(preview);
    expect(joinSessionByCode).not.toHaveBeenCalled();
    expect(getSessionMatches).not.toHaveBeenCalled();
    expect(getSessionParticipants).not.toHaveBeenCalled();
  });

  it('joins an active shared pickup before protected ID reads', async () => {
    getSessionByCode.mockResolvedValue({ id: 10, code: 'ABC', status: 'ACTIVE', league_id: null, created_by: 2 });
    joinSessionByCode.mockImplementation(async () => {
      expect(getSessionMatches).not.toHaveBeenCalled();
      expect(getSessionParticipants).not.toHaveBeenCalled();
    });
    getSessionMatches.mockResolvedValue([]);
    getSessionParticipants.mockResolvedValue([{ player_id: 1, full_name: 'Test Player' }]);
    const { result } = renderHook(() => usePickupSession('ABC'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(joinSessionByCode).toHaveBeenCalledWith('ABC');
    expect(getSessionMatches).toHaveBeenCalledWith(10);
    expect(result.current.error).toBeNull();
  });

  describe('pickup session (league_id = null)', () => {
    it('sets session, matches, and participants for a pickup session', async () => {
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 2 };
      const matches = [{ id: 101 }, { id: 102 }];
      const participants = [
        { player_id: 1, full_name: 'Alice' },
        { player_id: 2, full_name: 'Bob' },
        { player_id: 3, full_name: 'Carol' },
        { player_id: 4, full_name: 'Dave' },
      ];

      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue(matches);
      getSessionParticipants.mockResolvedValue(participants);

      const { result } = renderHook(() => usePickupSession('ABC'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.session).toEqual(session);
      expect(result.current.matches).toEqual(matches);
      expect(result.current.participants).toEqual(participants);
      expect(result.current.error).toBeNull();
    });
  });

  describe('session not found', () => {
    it('sets error to "Session not found" when API returns null', async () => {
      getSessionByCode.mockResolvedValue(null);

      const { result } = renderHook(() => usePickupSession('MISSING'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Session not found');
      expect(result.current.session).toBeNull();
      expect(result.current.matches).toEqual([]);
      expect(result.current.participants).toEqual([]);
    });
  });

  describe('API error', () => {
    it('sets error from err.response.data.detail when API throws', async () => {
      const apiError = new Error('Server error');
      apiError.response = { data: { detail: 'Session access denied' } };
      getSessionByCode.mockRejectedValue(apiError);

      const { result } = renderHook(() => usePickupSession('ERR'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Session access denied');
      expect(result.current.session).toBeNull();
    });

    it('falls back to err.message when response detail is absent', async () => {
      const apiError = new Error('Network error');
      getSessionByCode.mockRejectedValue(apiError);

      const { result } = renderHook(() => usePickupSession('ERR2'));

      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.error).toBe('Network error');
    });
  });

  describe('refresh', () => {
    it('triggers a reload when refresh() is called', async () => {
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(getSessionByCode).toHaveBeenCalledTimes(1);

      act(() => {
        result.current.refresh();
      });

      await waitFor(() => expect(getSessionByCode).toHaveBeenCalledTimes(2));
    });
  });

  describe('isCreator', () => {
    it('is true when currentUserPlayer.id matches session.created_by', async () => {
      useAuth.mockReturnValue({ currentUserPlayer: { id: 7 }, isAuthenticated: true });
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 7 };
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.isCreator).toBe(true);
    });

    it('is false when session is null', () => {
      const { result } = renderHook(() => usePickupSession(undefined));

      expect(result.current.isCreator).toBe(false);
    });
  });

  describe('hasLessThanFourPlayers', () => {
    it('is true with 3 participants', async () => {
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      const participants = [
        { player_id: 1, full_name: 'Alice' },
        { player_id: 2, full_name: 'Bob' },
        { player_id: 3, full_name: 'Carol' },
      ];
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue(participants);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasLessThanFourPlayers).toBe(true);
    });

    it('is false with 4 participants', async () => {
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      const participants = [
        { player_id: 1, full_name: 'Alice' },
        { player_id: 2, full_name: 'Bob' },
        { player_id: 3, full_name: 'Carol' },
        { player_id: 4, full_name: 'Dave' },
      ];
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue(participants);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.hasLessThanFourPlayers).toBe(false);
    });
  });

  describe('membersForModal', () => {
    it('maps participant fields to player_id and player_name', async () => {
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      const participants = [
        { player_id: 1, full_name: 'Alice' },
        { player_id: 2, full_name: null },
      ];
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue(participants);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.membersForModal).toEqual([
        { player_id: 1, player_name: 'Alice' },
        { player_id: 2, player_name: 'Player 2' },
      ]);
    });
  });

  describe('transformedMatches', () => {
    it('calls sessionMatchToDisplayFormat for each match', async () => {
      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      const matches = [{ id: 101 }, { id: 102 }];
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue(matches);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(sessionMatchToDisplayFormat).toHaveBeenCalledTimes(2);
      expect(result.current.transformedMatches).toEqual([
        { id: 101, transformed: true },
        { id: 102, transformed: true },
      ]);
    });
  });

  describe('userLeagues from AppContext', () => {
    it('exposes userLeagues from AppContext', async () => {
      useApp.mockReturnValue({ userLeagues: [{ id: 1, name: 'Beach League' }] });

      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.userLeagues).toEqual([{ id: 1, name: 'Beach League' }]);
    });

    it('exposes empty userLeagues when context has none', async () => {
      useApp.mockReturnValue({ userLeagues: [] });

      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: null };
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.userLeagues).toEqual([]);
    });
  });
});
