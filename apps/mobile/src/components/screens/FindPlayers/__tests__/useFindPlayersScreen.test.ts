/**
 * Tests for useFindPlayersScreen hook.
 *
 * Focus: the players list must normalize the paginated discover response
 * ({ items: [...] }) into a plain array. A regression here crashed the screen
 * with "all.filter is not a function" when the hook treated the paginated
 * object as if it were an array.
 */

import { renderHook, waitFor } from '@testing-library/react-native';

// ---------------------------------------------------------------------------
// Mocks — factories run before the subject under test is imported.
// ---------------------------------------------------------------------------

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/utils/haptics', () => ({
  hapticMedium: jest.fn(),
}));

jest.mock('@/lib/api', () => ({
  api: {
    discoverPlayers: jest.fn(),
    getFriends: jest.fn(),
    getFriendRequests: jest.fn(),
    sendFriendRequest: jest.fn(),
    acceptFriendRequest: jest.fn(),
    declineFriendRequest: jest.fn(),
  },
}));

import { useFindPlayersScreen } from '../useFindPlayersScreen';
import { api } from '@/lib/api';

const mockApi = api as unknown as {
  discoverPlayers: jest.Mock;
  getFriends: jest.Mock;
  getFriendRequests: jest.Mock;
};

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const PLAYER = {
  player_id: 7,
  full_name: 'Bob Jones',
  avatar: null,
  city: 'San Diego',
  level: 'advanced',
  games_played: 12,
  mutual_friends_count: 1,
  last_active_label: null,
  friend_status: 'none' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.getFriends.mockResolvedValue({ items: [] });
  mockApi.getFriendRequests.mockResolvedValue({ items: [] });
});

describe('useFindPlayersScreen', () => {
  it('normalizes a paginated discover response into a players array', async () => {
    mockApi.discoverPlayers.mockResolvedValue({
      items: [PLAYER],
      total_count: 1,
      page: 1,
      page_size: 25,
    });

    const { result } = renderHook(() => useFindPlayersScreen());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.playersError).toBeNull();
    expect(result.current.players).toEqual([PLAYER]);
  });

  it('still supports a bare-array discover response', async () => {
    mockApi.discoverPlayers.mockResolvedValue([PLAYER]);

    const { result } = renderHook(() => useFindPlayersScreen());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([PLAYER]);
  });

  it('falls back to an empty array when items is absent', async () => {
    mockApi.discoverPlayers.mockResolvedValue({ total_count: 0 });

    const { result } = renderHook(() => useFindPlayersScreen());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([]);
  });

  it('maps the backend discover item shape onto DiscoverPlayer', async () => {
    // Backend serializes id/location_name/total_games/mutual_friend_count.
    mockApi.discoverPlayers.mockResolvedValue({
      items: [
        {
          id: 2,
          full_name: 'Colan Gulla',
          avatar: 'CG',
          location_name: 'NY - New York City Metro',
          level: 'Open',
          total_games: 102,
          mutual_friend_count: 3,
          friend_status: 'none',
        },
      ],
    });

    const { result } = renderHook(() => useFindPlayersScreen());

    await waitFor(() => expect(result.current.isLoadingPlayers).toBe(false));

    expect(result.current.players).toEqual([
      {
        player_id: 2,
        full_name: 'Colan Gulla',
        avatar: 'CG',
        city: 'NY - New York City Metro',
        level: 'Open',
        games_played: 102,
        mutual_friends_count: 3,
        last_active_label: null,
        friend_status: 'none',
      },
    ]);
  });
});
