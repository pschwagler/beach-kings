import React, { type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ConversationListResponse,
  ThreadResponse,
} from '@beach-kings/shared';
import { useMessageMutations } from '@/features/messages/useMessageMutations';
import { messageKeys } from '@/features/messages/keys';

const mockSetConversationHidden = jest.fn();

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));

jest.mock('@/lib/api', () => ({
  api: {
    setConversationHidden: (...args: unknown[]) =>
      mockSetConversationHidden(...args),
    markThreadRead: jest.fn(),
    sendDirectMessage: jest.fn(),
  },
}));

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

describe('useMessageMutations', () => {
  it('rolls the thread and folders back when hiding fails', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const inbox: ConversationListResponse = {
      items: [{
        player_id: 42,
        full_name: 'Morgan Davis',
        avatar: null,
        last_message_text: 'Hi',
        last_message_at: '2026-08-30T12:00:00Z',
        last_message_sender_id: 42,
        unread_count: 1,
        is_friend: true,
        is_hidden: false,
      }],
      total_count: 1,
    };
    const hidden: ConversationListResponse = { items: [], total_count: 0 };
    const thread: ThreadResponse = {
      items: [],
      total_count: 0,
      is_hidden: false,
    };
    client.setQueryData(messageKeys.conversations(7, 'inbox'), inbox);
    client.setQueryData(messageKeys.conversations(7, 'hidden'), hidden);
    client.setQueryData(messageKeys.thread(7, 42), thread);
    mockSetConversationHidden.mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useMessageMutations(), {
      wrapper: wrapperFor(client),
    });

    await act(async () => {
      await expect(
        result.current.setConversationHidden.mutateAsync({
          playerId: 42,
          hidden: true,
        }),
      ).rejects.toThrow('offline');
    });

    await waitFor(() => {
      expect(
        client.getQueryData<ThreadResponse>(messageKeys.thread(7, 42)),
      ).toEqual(thread);
      expect(
        client.getQueryData(messageKeys.conversations(7, 'inbox')),
      ).toEqual(inbox);
      expect(
        client.getQueryData(messageKeys.conversations(7, 'hidden')),
      ).toEqual(hidden);
    });
  });

  it('preserves a newer message while conditionally rolling back visibility', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const inbox: ConversationListResponse = {
      items: [{
        player_id: 42,
        full_name: 'Morgan Davis',
        avatar: null,
        last_message_text: 'Old message',
        last_message_at: '2026-08-30T12:00:00Z',
        last_message_sender_id: 42,
        unread_count: 1,
        is_friend: true,
        is_hidden: false,
      }],
      total_count: 1,
    };
    const hidden: ConversationListResponse = { items: [], total_count: 0 };
    const thread: ThreadResponse = {
      items: [],
      total_count: 0,
      is_hidden: false,
    };
    client.setQueryData(messageKeys.conversations(7, 'inbox'), inbox);
    client.setQueryData(messageKeys.conversations(7, 'hidden'), hidden);
    client.setQueryData(messageKeys.thread(7, 42), thread);
    let rejectRequest: ((error: Error) => void) | undefined;
    mockSetConversationHidden.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRequest = reject;
      }),
    );
    const { result } = renderHook(() => useMessageMutations(), {
      wrapper: wrapperFor(client),
    });

    let mutation: Promise<unknown>;
    await act(async () => {
      mutation = result.current.setConversationHidden.mutateAsync({
        playerId: 42,
        hidden: true,
      });
      await waitFor(() => {
        expect(
          client.getQueryData<ThreadResponse>(messageKeys.thread(7, 42))
            ?.is_hidden,
        ).toBe(true);
      });
    });

    client.setQueryData<ConversationListResponse>(
      messageKeys.conversations(7, 'hidden'),
      (current) => current == null ? current : {
        ...current,
        items: current.items.map((item) => item.player_id === 42 ? {
          ...item,
          last_message_text: 'New socket message',
          last_message_at: '2026-08-30T12:01:00Z',
        } : item),
      },
    );
    client.setQueryData<ThreadResponse>(messageKeys.thread(7, 42), (current) =>
      current == null ? current : {
        ...current,
        items: [{
          id: 99,
          sender_player_id: 42,
          receiver_player_id: 7,
          message_text: 'New socket message',
          is_read: false,
          read_at: null,
          created_at: '2026-08-30T12:01:00Z',
        }, ...current.items],
        total_count: current.total_count + 1,
      },
    );

    await act(async () => {
      rejectRequest?.(new Error('offline'));
      await expect(mutation!).rejects.toThrow('offline');
    });

    expect(
      client.getQueryData<ThreadResponse>(messageKeys.thread(7, 42)),
    ).toEqual(expect.objectContaining({
      is_hidden: false,
      total_count: 1,
      items: [expect.objectContaining({ id: 99 })],
    }));
    expect(
      client.getQueryData<ConversationListResponse>(
        messageKeys.conversations(7, 'inbox'),
      )?.items[0],
    ).toEqual(expect.objectContaining({
      player_id: 42,
      last_message_text: 'New socket message',
      is_hidden: false,
    }));
  });
});
