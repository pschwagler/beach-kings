/**
 * Tests for usePlayerProfileScreen hook.
 *
 * Verifies that api.getPlayerLeagues is called with the correct player ID,
 * that the leagues field is populated from the API response, and that a
 * rejected call falls back to an empty array.
 */

import { renderHook, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mock @/lib/api — factory runs before any imports of the subject under test.
// ---------------------------------------------------------------------------

jest.mock('@/lib/api', () => ({
  api: {
    getPublicPlayer: jest.fn(),
    getMutualFriends: jest.fn(),
    batchFriendStatus: jest.fn(),
    getPlayerLeagues: jest.fn(),
    sendFriendRequest: jest.fn(),
  },
}));

// ---------------------------------------------------------------------------
// Subject under test (imported after mocks are established)
// ---------------------------------------------------------------------------

import { usePlayerProfileScreen } from '../usePlayerProfileScreen';
import { api } from '@/lib/api';

// ---------------------------------------------------------------------------
// Typed cast for type-safe mock access
// ---------------------------------------------------------------------------

const mockApi = api as unknown as {
  getPublicPlayer: jest.Mock;
  getMutualFriends: jest.Mock;
  batchFriendStatus: jest.Mock;
  getPlayerLeagues: jest.Mock;
  sendFriendRequest: jest.Mock;
};

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const PLAYER_ID = 42;

const FAKE_PLAYER = {
  id: PLAYER_ID,
  first_name: 'Alice',
  last_name: 'Smith',
  name: 'Alice Smith',
};

const FAKE_LEAGUES = [
  { id: 1, name: 'QBK Open Men', rank: 2, games_played: 30 },
  { id: 5, name: 'NYC Fun League', rank: null, games_played: 0 },
];

const noop = () => {};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getPublicPlayer.mockResolvedValue(FAKE_PLAYER);
  mockApi.getMutualFriends.mockResolvedValue([]);
  mockApi.batchFriendStatus.mockResolvedValue({ statuses: {}, mutual_counts: {} });
  mockApi.getPlayerLeagues.mockResolvedValue(FAKE_LEAGUES);
});

describe('usePlayerProfileScreen', () => {
  it('calls api.getPlayerLeagues with the numeric player ID', async () => {
    const { result } = renderHook(() =>
      usePlayerProfileScreen(PLAYER_ID, noop)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApi.getPlayerLeagues).toHaveBeenCalledTimes(1);
    expect(mockApi.getPlayerLeagues).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('populates leagues from the API response', async () => {
    const { result } = renderHook(() =>
      usePlayerProfileScreen(PLAYER_ID, noop)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profileData?.leagues).toEqual(FAKE_LEAGUES);
  });

  it('converts a string playerId to a number before calling the API', async () => {
    const { result } = renderHook(() =>
      usePlayerProfileScreen(String(PLAYER_ID), noop)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockApi.getPlayerLeagues).toHaveBeenCalledWith(PLAYER_ID);
  });

  it('sets isNotFound when getPublicPlayer 404s (hidden/0-game profile)', async () => {
    const notFoundError = Object.assign(new Error('Request failed with status code 404'), {
      response: { status: 404 },
    });
    mockApi.getPublicPlayer.mockRejectedValue(notFoundError);

    const { result } = renderHook(() =>
      usePlayerProfileScreen(PLAYER_ID, noop)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.isNotFound).toBe(true);
  });

  it('keeps isNotFound false for non-404 errors', async () => {
    mockApi.getPublicPlayer.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      usePlayerProfileScreen(PLAYER_ID, noop)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).not.toBeNull();
    expect(result.current.isNotFound).toBe(false);
  });

  it('falls back to empty array when api.getPlayerLeagues rejects', async () => {
    mockApi.getPlayerLeagues.mockRejectedValue(new Error('network error'));

    const { result } = renderHook(() =>
      usePlayerProfileScreen(PLAYER_ID, noop)
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profileData?.leagues).toEqual([]);
    // Other data should still be populated
    expect(result.current.profileData?.player).toEqual(FAKE_PLAYER);
  });

  it.each([
    ['friend', 'friends'],
    ['pending_outgoing', 'pending'],
    ['pending_incoming', 'pending'],
    ['none', 'none'],
  ] as const)('maps API friendship status %s to %s', async (apiStatus, expected) => {
    mockApi.batchFriendStatus.mockResolvedValue({
      statuses: { [String(PLAYER_ID)]: apiStatus },
      mutual_counts: {},
    });

    const { result } = renderHook(() => usePlayerProfileScreen(PLAYER_ID, noop));
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.profileData?.friendStatus).toBe(expected);
  });
});
