import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/api', () => ({
  getSessionByCode: vi.fn(),
  getSessionMatches: vi.fn(),
  getSessionParticipants: vi.fn(),
  getUserLeagues: vi.fn(),
}));

vi.mock('../../components/league/utils/matchUtils', () => ({
  sessionMatchToDisplayFormat: vi.fn((m) => ({ ...m, transformed: true })),
  buildPlaceholderIdSet: vi.fn(() => new Set()),
}));

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: vi.fn(() => ({ currentUserPlayer: { id: 1 }, isAuthenticated: true })),
}));

import { usePickupSession } from '../usePickupSession';
import {
  getSessionByCode,
  getSessionMatches,
  getSessionParticipants,
  getUserLeagues,
} from '../../services/api';
import { sessionMatchToDisplayFormat } from '../../components/league/utils/matchUtils';
import { useAuth } from '../../contexts/AuthContext';

describe('usePickupSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({ currentUserPlayer: { id: 1 }, isAuthenticated: true });
    getUserLeagues.mockResolvedValue([]);
  });

  describe('no code provided', () => {
    it('sets loading to false and makes no API calls when code is falsy', async () => {
      const { result } = renderHook(() => usePickupSession(undefined));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(getSessionByCode).not.toHaveBeenCalled();
    });
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

  describe('getUserLeagues', () => {
    it('is called when the user is authenticated', async () => {
      useAuth.mockReturnValue({ currentUserPlayer: { id: 1 }, isAuthenticated: true });
      getUserLeagues.mockResolvedValue([{ id: 1, name: 'Beach Kings' }]);

      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: 1 };
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(getUserLeagues).toHaveBeenCalled();
      expect(result.current.userLeagues).toEqual([{ id: 1, name: 'Beach Kings' }]);
    });

    it('does not call getUserLeagues when not authenticated', async () => {
      useAuth.mockReturnValue({ currentUserPlayer: null, isAuthenticated: false });

      const session = { id: 10, code: 'ABC', league_id: null, season_id: null, created_by: null };
      getSessionByCode.mockResolvedValue(session);
      getSessionMatches.mockResolvedValue([]);
      getSessionParticipants.mockResolvedValue([]);

      const { result } = renderHook(() => usePickupSession('ABC'));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(getUserLeagues).not.toHaveBeenCalled();
    });
  });
});
