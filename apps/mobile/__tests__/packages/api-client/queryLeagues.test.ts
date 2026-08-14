/**
 * Unit tests for the queryLeagues shape adaptation in api-client/methods.ts.
 *
 * Verifies that the raw backend response (is_open, has_pending_request, friends_preview)
 * is correctly mapped to the UI-ready FindLeagueResult shape
 * (access_type, user_status, friends_in_league).
 */

import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawItem(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Test League',
    gender: 'coed',
    level: 'Open',
    is_open: true,
    location_name: 'Brooklyn, NY',
    member_count: 10,
    has_pending_request: false,
    friends_preview: [] as Array<{ player_id: number; first_name: string; last_name: string | null; avatar: string | null }>,
    ...overrides,
  };
}

function makeMockClient(items: ReturnType<typeof makeRawItem>[], extra: Record<string, unknown> = {}) {
  const mockPost = jest.fn().mockResolvedValue({
    data: { items, page: 1, page_size: 25, total_count: items.length, ...extra },
  });
  return {
    axiosInstance: { post: mockPost },
  } as unknown as ApiClient;
}

// ---------------------------------------------------------------------------
// access_type mapping
// ---------------------------------------------------------------------------

describe('queryLeagues — access_type mapping', () => {
  it('maps is_open: true to access_type: open', async () => {
    const client = makeMockClient([makeRawItem({ is_open: true })]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].access_type).toBe('open');
  });

  it('maps is_open: false to access_type: invite_only', async () => {
    const client = makeMockClient([makeRawItem({ is_open: false })]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].access_type).toBe('invite_only');
  });
});

// ---------------------------------------------------------------------------
// user_status mapping
// ---------------------------------------------------------------------------

describe('queryLeagues — user_status mapping', () => {
  it('maps has_pending_request: true to user_status: requested', async () => {
    const client = makeMockClient([makeRawItem({ has_pending_request: true })]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].user_status).toBe('requested');
  });

  it('maps has_pending_request: false to user_status: none', async () => {
    const client = makeMockClient([makeRawItem({ has_pending_request: false })]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].user_status).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// friends_in_league / initials mapping
// ---------------------------------------------------------------------------

describe('queryLeagues — friends_in_league mapping', () => {
  it('produces two-character initials from first_name + last_name', async () => {
    const client = makeMockClient([
      makeRawItem({
        friends_preview: [{ player_id: 10, first_name: 'Alice', last_name: 'Smith', avatar: null }],
      }),
    ]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].friends_in_league[0]).toEqual({
      player_id: 10,
      initials: 'AS',
      avatar_url: null,
    });
  });

  it('produces single-character initials when last_name is null', async () => {
    const client = makeMockClient([
      makeRawItem({
        friends_preview: [{ player_id: 11, first_name: 'Bob', last_name: null, avatar: null }],
      }),
    ]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].friends_in_league[0]).toEqual({
      player_id: 11,
      initials: 'B',
      avatar_url: null,
    });
  });

  it('maps empty friends_preview to empty friends_in_league', async () => {
    const client = makeMockClient([makeRawItem({ friends_preview: [] })]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].friends_in_league).toEqual([]);
  });

  it('preserves player_id on each friend', async () => {
    const client = makeMockClient([
      makeRawItem({
        friends_preview: [
          { player_id: 42, first_name: 'Carlos', last_name: 'Ruiz', avatar: null },
        ],
      }),
    ]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].friends_in_league[0].player_id).toBe(42);
  });

  it('preserves the uploaded profile picture for each friend', async () => {
    const client = makeMockClient([
      makeRawItem({
        friends_preview: [
          {
            player_id: 42,
            first_name: 'Carlos',
            last_name: 'Ruiz',
            avatar: 'https://cdn.example.com/carlos.jpg',
          },
        ],
      }),
    ]);
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.items[0].friends_in_league[0].avatar_url).toBe(
      'https://cdn.example.com/carlos.jpg',
    );
  });
});

// ---------------------------------------------------------------------------
// Request params
// ---------------------------------------------------------------------------

describe('queryLeagues — request params', () => {
  it('sends q when provided', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    await methods.queryLeagues({ q: 'beach' });
    expect((client.axiosInstance.post as jest.Mock).mock.calls[0][1]).toMatchObject({ q: 'beach' });
  });

  it('omits q when null', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    await methods.queryLeagues({ q: null });
    expect((client.axiosInstance.post as jest.Mock).mock.calls[0][1]).not.toHaveProperty('q');
  });

  it('sends is_open: true when provided', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    await methods.queryLeagues({ is_open: true });
    expect((client.axiosInstance.post as jest.Mock).mock.calls[0][1]).toMatchObject({ is_open: true });
  });

  it('sends page: 0 (not skipped)', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    await methods.queryLeagues({ page: 0 });
    expect((client.axiosInstance.post as jest.Mock).mock.calls[0][1]).toMatchObject({ page: 0 });
  });

  it('sends gender and level filters', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    await methods.queryLeagues({ gender: 'mens', level: 'A' });
    expect((client.axiosInstance.post as jest.Mock).mock.calls[0][1]).toMatchObject({ gender: 'mens', level: 'A' });
  });
});

// ---------------------------------------------------------------------------
// Pagination passthrough
// ---------------------------------------------------------------------------

describe('queryLeagues — pagination passthrough', () => {
  it('passes through page, page_size, total_count from response', async () => {
    const client = makeMockClient([], { page: 3, page_size: 10, total_count: 55 });
    const methods = createApiMethods(client);
    const result = await methods.queryLeagues({});
    expect(result.page).toBe(3);
    expect(result.page_size).toBe(10);
    expect(result.total_count).toBe(55);
  });
});
