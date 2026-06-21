/**
 * Unit tests for getPublicPlayer + mapPublicPlayerToPlayer in api-client/methods.ts.
 *
 * The mobile PlayerProfile screen consumes a flat Player shape, but the public
 * profile endpoint (GET /api/public/players/{id}) nests rating/games under
 * `stats` and city/state under `location`. These tests lock the URL and the
 * response->Player adapter so the profile header + stats grid render correctly.
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

const PUBLIC_RESPONSE: PublicPlayerResponse = {
  id: 42,
  full_name: 'Alice Smith',
  avatar: 'AS',
  gender: 'female',
  level: 'intermediate',
  is_placeholder: false,
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
// mapPublicPlayerToPlayer
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
});
