import { QueryClient } from '@tanstack/react-query';
import { applyPlayerBlock, rollbackPlayerBlock } from '@/features/moderation';
import { messageKeys } from '@/features/messages/keys';
import { notificationKeys } from '@/features/notifications/keys';
import { socialKeys } from '@/features/social/keys';

describe('player block cache patch', () => {
  it('removes the player from social, message, and actor notification caches', () => {
    const client = new QueryClient();
    client.setQueryData(socialKeys.friends(1), [
      { player_id: 7, full_name: 'Blocked' },
      { player_id: 8, full_name: 'Kept' },
    ]);
    client.setQueryData(socialKeys.requests(1), [
      { id: 3, sender_player_id: 7, receiver_player_id: 1 },
    ]);
    client.setQueryData(messageKeys.conversations(1), {
      items: [{ player_id: 7 }, { player_id: 8 }],
      total_count: 2,
    });
    client.setQueryData(notificationKeys.feed(1), [
      { id: 1, actor_player_id: 7 },
      { id: 2, actor_player_id: 8 },
    ]);

    applyPlayerBlock(client, 1, 7, 'block:1');

    expect(client.getQueryData<unknown[]>(socialKeys.friends(1))).toHaveLength(1);
    expect(client.getQueryData<unknown[]>(socialKeys.requests(1))).toHaveLength(0);
    expect(client.getQueryData<{ items: unknown[] }>(messageKeys.conversations(1))?.items).toHaveLength(1);
    expect(client.getQueryData<unknown[]>(notificationKeys.feed(1))).toEqual([
      expect.objectContaining({ id: 2 }),
    ]);
  });

  it('rolls back only while its optimistic value is still current', () => {
    const client = new QueryClient();
    const key = socialKeys.friends(1);
    const original = [{ player_id: 7 }, { player_id: 8 }];
    client.setQueryData(key, original);
    const patch = applyPlayerBlock(client, 1, 7, 'block:1');

    const socketValue = [{ player_id: 9 }];
    client.setQueryData(key, socketValue);
    rollbackPlayerBlock(client, patch);

    expect(client.getQueryData(key)).toEqual(socketValue);
  });

  it('restores its own optimistic removal when no newer data arrived', () => {
    const client = new QueryClient();
    const key = socialKeys.friends(1);
    const original = [{ player_id: 7 }, { player_id: 8 }];
    client.setQueryData(key, original);
    const patch = applyPlayerBlock(client, 1, 7, 'block:1');

    rollbackPlayerBlock(client, patch);

    expect(client.getQueryData(key)).toEqual(original);
  });
});
