/**
 * Unit tests for the getLeague shape adaptation in api-client/methods.ts.
 *
 * Verifies that the raw backend response (is_open, user_role, user_* stats)
 * is correctly mapped to the UI-ready LeagueDetail shape (access_type, typed user_role).
 */

import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 42,
    name: 'Test League',
    description: 'A test league',
    is_open: true,
    is_public: true,
    gender: 'coed',
    level: 'Intermediate',
    location_name: 'San Diego, CA',
    home_courts: [] as Array<{ id: number; name: string; address: string | null; position: number }>,
    member_count: 5,
    season_count: 3,
    current_season_id: 10,
    current_season_name: 'Summer 2025',
    is_active: true,
    user_role: 'admin',
    user_rank: 2,
    user_wins: 8,
    user_losses: 2,
    user_rating: 120.5,
    ...overrides,
  };
}

function makeMockClient(raw: ReturnType<typeof makeRawDetail>) {
  const mockGet = jest.fn().mockResolvedValue({ data: raw });
  return {
    axiosInstance: { get: mockGet },
  } as unknown as ApiClient;
}

// ---------------------------------------------------------------------------
// access_type mapping
// ---------------------------------------------------------------------------

describe('getLeague — access_type mapping', () => {
  it('maps is_open: true to access_type: open', async () => {
    const client = makeMockClient(makeRawDetail({ is_open: true }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.access_type).toBe('open');
  });

  it('maps is_open: false to access_type: invite_only', async () => {
    const client = makeMockClient(makeRawDetail({ is_open: false }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.access_type).toBe('invite_only');
  });
});

// ---------------------------------------------------------------------------
// user_role passthrough
// ---------------------------------------------------------------------------

describe('getLeague — user_role passthrough', () => {
  it('passes through user_role: admin', async () => {
    const client = makeMockClient(makeRawDetail({ user_role: 'admin' }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.user_role).toBe('admin');
  });

  it('passes through user_role: member', async () => {
    const client = makeMockClient(makeRawDetail({ user_role: 'member' }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.user_role).toBe('member');
  });

  it('passes through user_role: null for non-members', async () => {
    const client = makeMockClient(
      makeRawDetail({ user_role: null, user_rank: null, user_wins: null, user_losses: null, user_rating: null }),
    );
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.user_role).toBeNull();
    expect(result.user_rank).toBeNull();
    expect(result.user_wins).toBeNull();
    expect(result.user_losses).toBeNull();
    expect(result.user_rating).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Season + member fields passthrough
// ---------------------------------------------------------------------------

describe('getLeague — season and member fields', () => {
  it('passes through member_count and season_count', async () => {
    const client = makeMockClient(makeRawDetail({ member_count: 12, season_count: 4 }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.member_count).toBe(12);
    expect(result.season_count).toBe(4);
  });

  it('passes through current_season_id and current_season_name', async () => {
    const client = makeMockClient(
      makeRawDetail({ current_season_id: 7, current_season_name: 'Fall 2025' }),
    );
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.current_season_id).toBe(7);
    expect(result.current_season_name).toBe('Fall 2025');
  });

  it('passes through is_active', async () => {
    const client = makeMockClient(makeRawDetail({ is_active: false }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.is_active).toBe(false);
  });

  it('passes through null current_season fields when no season exists', async () => {
    const client = makeMockClient(
      makeRawDetail({ season_count: 0, current_season_id: null, current_season_name: null, is_active: false }),
    );
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.season_count).toBe(0);
    expect(result.current_season_id).toBeNull();
    expect(result.current_season_name).toBeNull();
    expect(result.is_active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// has_pending_request mapping
// ---------------------------------------------------------------------------

describe('getLeague — has_pending_request mapping', () => {
  it('passes through has_pending_request: true', async () => {
    const client = makeMockClient(makeRawDetail({ has_pending_request: true }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.has_pending_request).toBe(true);
  });

  it('defaults has_pending_request to false when absent', async () => {
    const client = makeMockClient(makeRawDetail());
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.has_pending_request).toBe(false);
  });

  it('maps creator and terminal join-request metadata', async () => {
    const client = makeMockClient(makeRawDetail({
      created_by_player_id: 9,
      join_request_status: 'rejected',
    }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.created_by_player_id).toBe(9);
    expect(result.join_request_status).toBe('rejected');
  });
});

// ---------------------------------------------------------------------------
// is_public mapping
// ---------------------------------------------------------------------------

describe('getLeague — is_public mapping', () => {
  it('passes through is_public: true', async () => {
    const client = makeMockClient(makeRawDetail({ is_public: true }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.is_public).toBe(true);
  });

  it('passes through is_public: false', async () => {
    const client = makeMockClient(makeRawDetail({ is_public: false }));
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.is_public).toBe(false);
  });

  it('defaults is_public to false when absent', async () => {
    const raw = makeRawDetail();
    delete (raw as { is_public?: boolean }).is_public;
    const client = makeMockClient(raw);
    const methods = createApiMethods(client);
    const result = await methods.getLeague(42);
    expect(result.is_public).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Request URL
// ---------------------------------------------------------------------------

describe('getLeague — request URL', () => {
  it('calls GET /api/leagues/:id with the correct league id', async () => {
    const raw = makeRawDetail({ id: 99 });
    const client = makeMockClient(raw);
    const methods = createApiMethods(client);
    await methods.getLeague(99);
    expect((client.axiosInstance.get as jest.Mock).mock.calls[0][0]).toBe('/api/leagues/99');
  });
});

// ---------------------------------------------------------------------------
// joinLeague — POST /api/leagues/:id/join
// ---------------------------------------------------------------------------

describe('joinLeague', () => {
  function makePostMockClient(data: unknown) {
    const mockPost = jest.fn().mockResolvedValue({ data });
    return { axiosInstance: { post: mockPost } } as unknown as ApiClient;
  }

  it('POSTs to /api/leagues/:id/join with the correct league id', async () => {
    const client = makePostMockClient({ success: true, message: 'ok' });
    const methods = createApiMethods(client);
    await methods.joinLeague(99);
    expect((client.axiosInstance.post as jest.Mock).mock.calls[0][0]).toBe(
      '/api/leagues/99/join',
    );
  });

  it('returns the response payload', async () => {
    const client = makePostMockClient({ success: true, message: 'Joined!' });
    const methods = createApiMethods(client);
    const result = await methods.joinLeague(99);
    expect(result).toEqual({ success: true, message: 'Joined!' });
  });
});

describe('addLeagueMembersBatch', () => {
  it('POSTs selected players as member additions', async () => {
    const post = jest.fn().mockResolvedValue({
      data: { added: [], invited: [7], failed: [] },
    });
    const client = { axiosInstance: { post } } as unknown as ApiClient;
    const methods = createApiMethods(client);

    const result = await methods.addLeagueMembersBatch(42, [7, 8]);

    expect(post).toHaveBeenCalledWith('/api/leagues/42/members_batch', {
      members: [
        { player_id: 7, role: 'member' },
        { player_id: 8, role: 'member' },
      ],
    });
    expect(result.invited).toEqual([7]);
  });
});
