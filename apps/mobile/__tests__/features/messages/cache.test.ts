import { QueryClient } from '@tanstack/react-query';
import type {
  ConversationListResponse,
  DirectMessage,
  Notification,
  ThreadResponse,
} from '@beach-kings/shared';
import {
  applyMarkThreadRead,
  commitMarkThreadRead,
  reconcileDirectMessageEvent,
  rollbackMarkThreadRead,
} from '@/features/messages/cache';
import { messageKeys } from '@/features/messages/keys';
import { notificationKeys } from '@/features/notifications/keys';

const USER_ID = 7;
const PLAYER_ID = 42;

const incoming: DirectMessage = {
  id: 11,
  sender_player_id: PLAYER_ID,
  receiver_player_id: 9,
  message_text: 'Unread',
  is_read: false,
  read_at: null,
  created_at: '2026-07-25T12:00:00Z',
};

const conversations: ConversationListResponse = {
  items: [{
    player_id: PLAYER_ID,
    full_name: 'Alex Torres',
    avatar: null,
    last_message_text: incoming.message_text,
    last_message_at: incoming.created_at,
    last_message_sender_id: PLAYER_ID,
    unread_count: 2,
    is_friend: true,
  }],
  total_count: 1,
};

const thread: ThreadResponse = {
  items: [incoming],
  total_count: 1,
  has_more: false,
};

const dmNotification: Notification = {
  id: 70,
  user_id: USER_ID,
  type: 'direct_message',
  title: 'You have 2 unread messages',
  message: 'Alex: Unread',
  data: { unread_count: 2 },
  is_read: false,
  read_at: null,
  dismissed_at: null,
  link_url: '/home?tab=messages',
  created_at: incoming.created_at,
};

function makeClient(): QueryClient {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
  client.setQueryData(messageKeys.conversations(USER_ID), conversations);
  client.setQueryData(messageKeys.thread(USER_ID, PLAYER_ID), thread);
  client.setQueryData(messageKeys.unreadCount(USER_ID), { count: 2 });
  client.setQueryData(notificationKeys.feed(USER_ID), [dmNotification]);
  client.setQueryData(notificationKeys.unreadCount(USER_ID), { count: 1 });
  return client;
}

describe('message cache reconciliation', () => {
  it('isolates every personalized message cache by authenticated account', () => {
    expect(messageKeys.conversations(USER_ID)).toEqual([
      'private',
      USER_ID,
      'messages',
      'conversations',
    ]);
    expect(messageKeys.thread(USER_ID, PLAYER_ID)).not.toEqual(
      messageKeys.thread(USER_ID + 1, PLAYER_ID),
    );
  });

  it('optimistically clears a thread, inbox row, counts, and DM summary', () => {
    const client = makeClient();

    const patch = applyMarkThreadRead(
      client,
      USER_ID,
      PLAYER_ID,
      'read:1',
    );

    expect(
      client.getQueryData<ConversationListResponse>(
        messageKeys.conversations(USER_ID),
      )?.items[0]?.unread_count,
    ).toBe(0);
    expect(
      client.getQueryData<ThreadResponse>(
        messageKeys.thread(USER_ID, PLAYER_ID),
      )?.items[0],
    ).toEqual(expect.objectContaining({
      is_read: true,
      read_at: 'optimistic:read:1',
    }));
    expect(
      client.getQueryData<{ count: number }>(
        messageKeys.unreadCount(USER_ID),
      )?.count,
    ).toBe(0);
    expect(
      client.getQueryData<Notification[]>(
        notificationKeys.feed(USER_ID),
      )?.[0],
    ).toEqual(expect.objectContaining({ is_read: true }));
    expect(
      client.getQueryData<{ count: number }>(
        notificationKeys.unreadCount(USER_ID),
      )?.count,
    ).toBe(0);

    commitMarkThreadRead(client, USER_ID, patch);
    expect(
      client.getQueryData<ThreadResponse>(
        messageKeys.thread(USER_ID, PLAYER_ID),
      )?.items[0]?.read_at,
    ).not.toContain('optimistic:');
  });

  it('rolls back only cache values still owned by the failed mutation', () => {
    const client = makeClient();
    const patch = applyMarkThreadRead(
      client,
      USER_ID,
      PLAYER_ID,
      'read:2',
    );

    const newerConversation = {
      ...conversations.items[0]!,
      last_message_text: 'Newer socket data',
      unread_count: 1,
    };
    client.setQueryData<ConversationListResponse>(
      messageKeys.conversations(USER_ID),
      { ...conversations, items: [newerConversation] },
    );

    rollbackMarkThreadRead(client, USER_ID, patch);

    expect(
      client.getQueryData<ConversationListResponse>(
        messageKeys.conversations(USER_ID),
      )?.items[0],
    ).toEqual(newerConversation);
    expect(
      client.getQueryData<ThreadResponse>(
        messageKeys.thread(USER_ID, PLAYER_ID),
      )?.items[0],
    ).toEqual(incoming);
    expect(
      client.getQueryData<{ count: number }>(
        messageKeys.unreadCount(USER_ID),
      )?.count,
    ).toBe(2);
    expect(
      client.getQueryData<Notification[]>(
        notificationKeys.feed(USER_ID),
      )?.[0],
    ).toEqual(dmNotification);
  });

  it('upserts a socket message and advances inbox and unread caches', () => {
    const client = makeClient();
    const socketMessage: DirectMessage = {
      ...incoming,
      id: 12,
      message_text: 'Latest',
      created_at: '2026-07-25T12:01:00Z',
    };

    reconcileDirectMessageEvent(client, USER_ID, socketMessage);

    expect(
      client.getQueryData<ThreadResponse>(
        messageKeys.thread(USER_ID, PLAYER_ID),
      )?.items[0],
    ).toEqual(socketMessage);
    expect(
      client.getQueryData<ConversationListResponse>(
        messageKeys.conversations(USER_ID),
      )?.items[0],
    ).toEqual(expect.objectContaining({
      last_message_text: 'Latest',
      unread_count: 3,
    }));
    expect(
      client.getQueryData<{ count: number }>(
        messageKeys.unreadCount(USER_ID),
      )?.count,
    ).toBe(3);
  });
});
