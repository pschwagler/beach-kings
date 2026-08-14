/**
 * Unit tests for the league invite methods in api-client/methods.ts.
 *
 * Verifies correct URL construction, query param forwarding,
 * response passthrough, and void return for sendLeagueInvites.
 */

import { createApiMethods } from '../../../../../packages/api-client/src/methods';
import type { ApiClient } from '../../../../../packages/api-client/src/client';
import type { InvitablePlayer, LeagueInviteItem } from '@beach-kings/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockClient(data: unknown = null) {
  const mockGet = jest.fn().mockResolvedValue({ data });
  const mockPost = jest.fn().mockResolvedValue({ data });
  return {
    axiosInstance: { get: mockGet, post: mockPost },
    client: { get: mockGet, post: mockPost },
  } as unknown as ApiClient;
}

const INVITABLE_PLAYERS: InvitablePlayer[] = [
  {
    player_id: 10,
    display_name: 'Jake Donovan',
    initials: 'JD',
    location_name: 'Queens, NY',
    level: 'Open',
    invite_status: 'none',
    section: 'friends',
  },
];

const INVITE_ITEMS: LeagueInviteItem[] = [
  {
    id: 1,
    league_id: 7,
    league_name: 'QBK Open Men',
    player_id: 10,
    display_name: 'Jake Donovan',
    initials: 'JD',
    invited_at: '2026-01-01T00:00:00+00:00',
    status: 'pending',
  },
];

// ---------------------------------------------------------------------------
// getInvitablePlayers
// ---------------------------------------------------------------------------

describe('getInvitablePlayers', () => {
  it('calls GET /api/leagues/:id/invitable-players with correct league id', async () => {
    const client = makeMockClient(INVITABLE_PLAYERS);
    const methods = createApiMethods(client);
    await methods.getInvitablePlayers(7);
    expect((client.axiosInstance.get as jest.Mock).mock.calls[0][0]).toBe(
      '/api/leagues/7/invitable-players',
    );
  });

  it('passes query param when provided', async () => {
    const client = makeMockClient(INVITABLE_PLAYERS);
    const methods = createApiMethods(client);
    await methods.getInvitablePlayers(7, 'jake');
    const [, config] = (client.axiosInstance.get as jest.Mock).mock.calls[0];
    expect(config.params).toEqual({ q: 'jake' });
  });

  it('omits query param when not provided', async () => {
    const client = makeMockClient(INVITABLE_PLAYERS);
    const methods = createApiMethods(client);
    await methods.getInvitablePlayers(7);
    const [, config] = (client.axiosInstance.get as jest.Mock).mock.calls[0];
    expect(config.params).toEqual({});
  });

  it('returns response data passthrough', async () => {
    const client = makeMockClient(INVITABLE_PLAYERS);
    const methods = createApiMethods(client);
    const result = await methods.getInvitablePlayers(7);
    expect(result).toEqual(INVITABLE_PLAYERS);
  });
});

// ---------------------------------------------------------------------------
// sendLeagueInvites
// ---------------------------------------------------------------------------

describe('sendLeagueInvites', () => {
  it('calls POST /api/leagues/:id/invites with correct league id and player_ids', async () => {
    const client = makeMockClient();
    const methods = createApiMethods(client);
    await methods.sendLeagueInvites(7, [10, 11]);
    const [url, body] = (client.axiosInstance.post as jest.Mock).mock.calls[0];
    expect(url).toBe('/api/leagues/7/invites');
    expect(body).toEqual({ player_ids: [10, 11] });
  });

  it('returns void (undefined)', async () => {
    const client = makeMockClient({ success: true });
    const methods = createApiMethods(client);
    const result = await methods.sendLeagueInvites(7, [10]);
    expect(result).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getLeagueInvites
// ---------------------------------------------------------------------------

describe('getLeagueInvites', () => {
  it('calls GET /api/leagues/:id/invites with correct league id', async () => {
    const client = makeMockClient(INVITE_ITEMS);
    const methods = createApiMethods(client);
    await methods.getLeagueInvites(7);
    expect((client.axiosInstance.get as jest.Mock).mock.calls[0][0]).toBe(
      '/api/leagues/7/invites',
    );
  });

  it('returns response data passthrough', async () => {
    const client = makeMockClient(INVITE_ITEMS);
    const methods = createApiMethods(client);
    const result = await methods.getLeagueInvites(7);
    expect(result).toEqual(INVITE_ITEMS);
  });

  it('returns empty array when no invites exist', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    const result = await methods.getLeagueInvites(7);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getMySentLeagueInvites
// ---------------------------------------------------------------------------

describe('getMySentLeagueInvites', () => {
  it('calls GET /api/users/me/league-invites/sent', async () => {
    const client = makeMockClient(INVITE_ITEMS);
    const methods = createApiMethods(client);
    await methods.getMySentLeagueInvites();
    expect((client.axiosInstance.get as jest.Mock).mock.calls[0][0]).toBe(
      '/api/users/me/league-invites/sent',
    );
  });

  it('returns response data passthrough', async () => {
    const client = makeMockClient(INVITE_ITEMS);
    const methods = createApiMethods(client);
    const result = await methods.getMySentLeagueInvites();
    expect(result).toEqual(INVITE_ITEMS);
  });

  it('returns empty array when no sent invites exist', async () => {
    const client = makeMockClient([]);
    const methods = createApiMethods(client);
    const result = await methods.getMySentLeagueInvites();
    expect(result).toEqual([]);
  });
});
