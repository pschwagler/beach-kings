import { QueryClient } from '@tanstack/react-query';
import type { FriendRequest } from '@beach-kings/shared';
import {
  applyResolveFriendRequest,
  applySendFriendRequest,
  rollbackSocialCachePatch,
} from '@/features/social/cache';
import { socialKeys } from '@/features/social/keys';

const request: FriendRequest = {
  id: 22,
  sender_player_id: 44,
  sender_name: 'Taylor',
  sender_avatar: null,
  receiver_player_id: 7,
  receiver_name: 'Pat',
  receiver_avatar: null,
  status: 'pending',
  created_at: null,
  mutual_friends_count: 0,
  shared_league_name: null,
};

describe('social cache rollback markers', () => {
  // Raw QueryClients schedule GC timers; clear them so Jest can exit cleanly.
  const clients: QueryClient[] = [];
  const createClient = (): QueryClient => {
    const client = new QueryClient();
    clients.push(client);
    return client;
  };

  afterEach(() => {
    for (const client of clients) client.clear();
    clients.length = 0;
  });

  it('preserves a later equal relationship write', () => {
    const client = createClient();
    const key = socialKeys.relationship(7, 44);
    client.setQueryData(key, { status: 'none', request_id: null });
    const patch = applySendFriendRequest(client, 7, 44, 'send:1');

    // Structural sharing can retain the same object for an equal server value;
    // dataUpdateCount still proves that another authority wrote after us.
    client.setQueryData(key, {
      status: 'pending_outgoing',
      request_id: null,
    });
    rollbackSocialCachePatch(client, 7, patch);

    expect(client.getQueryData(key)).toEqual({
      status: 'pending_outgoing',
      request_id: null,
    });
  });

  it('does not resurrect a request after a later authoritative removal', () => {
    const client = createClient();
    const key = socialKeys.requests(7, 'incoming');
    client.setQueryData(key, [request]);

    const patch = applyResolveFriendRequest(
      client,
      7,
      { requestId: request.id, playerId: request.sender_player_id },
      'sender',
      'friend',
      'accept:1',
    );
    expect(client.getQueryData<FriendRequest[]>(key)?.filter(
      (candidate) => candidate.status === 'pending',
    )).toEqual([]);

    // TanStack may structurally share this equal array, so the mutation's
    // data-update marker—not object identity alone—must detect the later write.
    client.setQueryData(key, []);
    rollbackSocialCachePatch(client, 7, patch);

    expect(client.getQueryData(key)).toEqual([]);
  });
});
