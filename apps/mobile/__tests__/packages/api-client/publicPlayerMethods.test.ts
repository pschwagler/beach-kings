/**
 * Unit tests for getPublicPlayer + mapPublicPlayerToPlayer in api-client/methods.ts.
 *
 * The mobile PlayerProfile screen consumes a flat Player shape, but the public
 * profile endpoint (GET /api/public/players/{id}) nests rating/games under
 * `stats` and city/state under `location`. These tests lock the URL and the
 * response->Player adapter so the profile header + stats grid render correctly,
 * and that private profiles (game_history_visible=false) never render fabricated
 * 0-N stats.
 */

import {
  createApiMethods,
  mapPublicPlayerToPlayer,
} from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';
import type { PublicPlayerResponse } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClient(get: jest.Mock): ApiClient {
  return {
    axiosInstance: {
      get,
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
    },
  } as unknown as ApiClient;
}

/** Public player — all stats visible. */
const PUBLIC_RESPONSE: PublicPlayerResponse = {
  id: 42,
  full_name: 'Alice Smith',
  avatar: 'AS',
  gender: 'female',
  level: 'intermediate',
  is_placeholder: false,
  game_history_visible: true,
  profile_is_private: false,
  location: {
    id: 'socal_sd',
    name: 'San Diego',
    city: 'San Diego',
    state: 'CA',
    slug: 'san-diego',
  },
  stats: {
    current_rating: 1340,
    total_games: 50,
    total_wins: 30,
    win_rate: 0.6,
  },
  league_memberships: [{ league_id: 1, league_name: 'QBK Open' }],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
};

/**
 * Private player — win/loss history hidden, but ELO is always returned.
 * The backend always provides current_rating regardless of privacy settings.
 */
const PRIVATE_RESPONSE: PublicPlayerResponse = {
  ...PUBLIC_RESPONSE,
  game_history_visible: false,
  profile_is_private: true,
  stats: {
    current_rating: 1200,
    total_games: 10,
    total_wins: null,
    win_rate: null,
  },
};

// ---------------------------------------------------------------------------
// getPublicPlayer
// ---------------------------------------------------------------------------

describe('getPublicPlayer', () => {
  it('calls GET /api/public/players/{id}', async () => {
    const get = jest.fn().mockResolvedValue({ data: PUBLIC_RESPONSE });
    const methods = createApiMethods(makeClient(get));

    await methods.getPublicPlayer(42);

    expect(get).toHaveBeenCalledWith('/api/public/players/42');
  });

  it('returns the adapted Player shape', async () => {
    const get = jest.fn().mockResolvedValue({ data: PUBLIC_RESPONSE });
    const methods = createApiMethods(makeClient(get));

    const player = await methods.getPublicPlayer(42);

    expect(player).toEqual(mapPublicPlayerToPlayer(PUBLIC_RESPONSE));
  });
});

// ---------------------------------------------------------------------------
// mapPublicPlayerToPlayer — public player (game_history_visible: true)
// ---------------------------------------------------------------------------

describe('mapPublicPlayerToPlayer', () => {
  it('flattens stats onto top-level Player fields', () => {
    const player = mapPublicPlayerToPlayer(PUBLIC_RESPONSE);

    expect(player.current_rating).toBe(1340);
    expect(player.total_games).toBe(50);
    expect(player.total_wins).toBe(30);
    expect(player.wins).toBe(30);
    // losses derived from games - wins
    expect(player.losses).toBe(20);
  });

  it('maps full_name onto both name and full_name', () => {
    const player = mapPublicPlayerToPlayer(PUBLIC_RESPONSE);

    expect(player.name).toBe('Alice Smith');
    expect(player.full_name).toBe('Alice Smith');
  });

  it('flattens location city/state and keeps id/name/slug', () => {
    const player = mapPublicPlayerToPlayer(PUBLIC_RESPONSE);

    expect(player.city).toBe('San Diego');
    expect(player.state).toBe('CA');
    expect(player.location_id).toBe('socal_sd');
    expect(player.location_name).toBe('San Diego');
    expect(player.location_slug).toBe('san-diego');
  });

  it('carries through level, gender, avatar, is_placeholder, and leagues', () => {
    const player = mapPublicPlayerToPlayer(PUBLIC_RESPONSE);

    expect(player.level).toBe('intermediate');
    expect(player.gender).toBe('female');
    expect(player.avatar).toBe('AS');
    expect(player.is_placeholder).toBe(false);
    expect(player.league_memberships).toEqual([
      { league_id: 1, league_name: 'QBK Open' },
    ]);
  });

  it('tolerates a null location', () => {
    const player = mapPublicPlayerToPlayer({ ...PUBLIC_RESPONSE, location: null });

    expect(player.city).toBeNull();
    expect(player.state).toBeNull();
    expect(player.location_id).toBeNull();
    expect(player.location_name).toBeNull();
    expect(player.location_slug).toBeNull();
  });

  it('threads game_history_visible and profile_is_private onto Player', () => {
    const player = mapPublicPlayerToPlayer(PUBLIC_RESPONSE);

    expect(player.game_history_visible).toBe(true);
    expect(player.profile_is_private).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Private profile — stats hidden
  // -------------------------------------------------------------------------

  it('sets wins/losses/total_wins to null but preserves current_rating when game_history_visible is false', () => {
    const player = mapPublicPlayerToPlayer(PRIVATE_RESPONSE);

    expect(player.wins).toBeNull();
    expect(player.losses).toBeNull();
    // Rating is ALWAYS shown — the backend returns it regardless of privacy setting.
    expect(player.current_rating).toBe(1200);
    expect(player.total_wins).toBeNull();
  });

  it('preserves total_games (always present) even for a private player', () => {
    const player = mapPublicPlayerToPlayer(PRIVATE_RESPONSE);

    expect(player.total_games).toBe(10);
  });

  it('threads game_history_visible=false and profile_is_private=true onto Player', () => {
    const player = mapPublicPlayerToPlayer(PRIVATE_RESPONSE);

    expect(player.game_history_visible).toBe(false);
    expect(player.profile_is_private).toBe(true);
  });

  it('does NOT compute losses=games-wins when total_wins is null (prevents 0-N fabrication)', () => {
    // Backend may send game_history_visible=true but total_wins=null in edge cases.
    // current_rating is always provided as a number by the backend.
    const nullWinsResponse: PublicPlayerResponse = {
      ...PUBLIC_RESPONSE,
      game_history_visible: true,
      stats: {
        current_rating: 1100,
        total_games: 10,
        total_wins: null,
        win_rate: null,
      },
    };

    const player = mapPublicPlayerToPlayer(nullWinsResponse);

    // Must NOT derive losses = 10 - 0 (null coerced to 0).
    expect(player.losses).toBeNull();
    expect(player.wins).toBeNull();
  });
});
