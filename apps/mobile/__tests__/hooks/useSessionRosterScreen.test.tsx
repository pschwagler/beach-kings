/**
 * Tests for useSessionRosterScreen — roster + remove handler for the
 * Manage Players screen. Covers the entry_id/player_id mapping that
 * powers the DELETE endpoint, plus the remove-error surfacing path.
 */

import React from 'react';
import { renderHook, waitFor, act } from '@testing-library/react-native';

const mockGetSessionById = jest.fn();
const mockRemoveSessionPlayer = jest.fn();
const mockBack = jest.fn();
const mockHapticMedium = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/api', () => ({
  api: {
    getSessionById: (...args: unknown[]) => mockGetSessionById(...args),
    removeSessionPlayer: (...args: unknown[]) => mockRemoveSessionPlayer(...args),
  },
}));

jest.mock('expo-router', () => ({
  useRouter: jest.fn(() => ({ back: mockBack })),
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: (...args: unknown[]) => mockHapticMedium(...args),
}));

import { useSessionRosterScreen } from '@/components/screens/Sessions/useSessionRosterScreen';
import type { SessionDetail } from '@beach-kings/shared';

function makeSession(
  players: SessionDetail['players'],
): SessionDetail {
  return {
    id: 9,
    league_id: null,
    league_name: null,
    court_name: 'Court 2',
    date: '2026-04-02',
    start_time: '5:00 PM',
    session_number: 1,
    status: 'active',
    session_type: 'pickup',
    max_players: 16,
    notes: null,
    players,
    games: [],
    user_wins: 0,
    user_losses: 0,
    user_rating_change: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useSessionRosterScreen', () => {
  it('maps entry_id and player_id to the player_id field for real players', async () => {
    mockGetSessionById.mockResolvedValue(
      makeSession([
        { id: 11, player_id: 11, display_name: 'A', initials: 'A', is_placeholder: false, game_count: 0 },
      ]),
    );

    const { result } = renderHook(() => useSessionRosterScreen(9));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.players[0].entry_id).toBe(11);
    expect(result.current.players[0].player_id).toBe(11);
  });

  it('falls back to id when player_id is null (placeholder shape)', async () => {
    // Defensive fallback: backend always populates player_id today, but the
    // SessionPlayer type permits null. The DELETE endpoint must NOT receive 0.
    mockGetSessionById.mockResolvedValue(
      makeSession([
        {
          id: 22,
          player_id: null,
          display_name: 'Placeholder',
          initials: 'P',
          is_placeholder: true,
          game_count: 0,
        } as SessionDetail['players'][number],
      ]),
    );

    const { result } = renderHook(() => useSessionRosterScreen(9));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.players[0].entry_id).toBe(22);
    expect(result.current.players[0].player_id).toBe(22);
  });

  it('onRemovePlayer calls api.removeSessionPlayer with sessionId and entryId', async () => {
    mockGetSessionById.mockResolvedValue(
      makeSession([
        { id: 5, player_id: 5, display_name: 'P', initials: 'P', is_placeholder: false, game_count: 0 },
      ]),
    );
    mockRemoveSessionPlayer.mockResolvedValue(undefined);

    const { result } = renderHook(() => useSessionRosterScreen(9));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onRemovePlayer(5);
    });

    expect(mockRemoveSessionPlayer).toHaveBeenCalledWith(9, 5);
    expect(result.current.removeError).toBeNull();
  });

  it('onRemovePlayer surfaces error message when removeSessionPlayer throws', async () => {
    mockGetSessionById.mockResolvedValue(
      makeSession([
        { id: 5, player_id: 5, display_name: 'P', initials: 'P', is_placeholder: false, game_count: 0 },
      ]),
    );
    mockRemoveSessionPlayer.mockRejectedValue(new Error('Cannot remove player in active games'));

    const { result } = renderHook(() => useSessionRosterScreen(9));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.onRemovePlayer(5);
    });

    expect(result.current.removeError).toBe('Cannot remove player in active games');
    expect(result.current.isRemoving).toBeNull();
  });

  it('onClose calls router.back', async () => {
    mockGetSessionById.mockResolvedValue(makeSession([]));

    const { result } = renderHook(() => useSessionRosterScreen(9));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      result.current.onClose();
    });

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
