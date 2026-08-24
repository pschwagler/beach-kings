import type {
  Conversation,
  ConversationListResponse,
  DirectMessage,
  ThreadResponse,
  Player,
} from '@beach-kings/shared';
import type { QueryClient } from '@tanstack/react-query';
import {
  applyDirectMessageSummaryRead,
  commitDirectMessageSummaryRead,
  rollbackDirectMessageSummaryRead,
  type DirectMessageSummaryPatch,
} from '@/features/notifications/cache';
import { messageKeys } from './keys';
import { socialKeys } from '@/features/social/keys';
import type { PlayerProfileDetails } from '@/features/social/queries';

export interface PeerIdentity {
  readonly playerId: number;
  readonly fullName: string;
  readonly avatar: string | null | undefined;
}

export function privacyAllowedAvatar(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized != null &&
    /^(?:https?:|file:|data:|content:|blob:)/i.test(normalized)
    ? normalized
    : null;
}

/** Reconciles one server-approved peer identity across user-scoped caches. */
export function reconcilePeerIdentityCaches(
  queryClient: QueryClient,
  userId: number,
  identity: PeerIdentity,
): void {
  if (userId <= 0 || identity.playerId <= 0) return;
  const avatar = privacyAllowedAvatar(identity.avatar);
  const fullName = identity.fullName.trim() || 'Player';

  queryClient.setQueryData<ConversationListResponse>(
    messageKeys.conversations(userId),
    (current) => {
      if (current == null) return current;
      let changed = false;
      const items = current.items.map((conversation) => {
        if (conversation.player_id !== identity.playerId) return conversation;
        if (conversation.avatar === avatar && conversation.full_name === fullName) {
          return conversation;
        }
        changed = true;
        return { ...conversation, avatar, full_name: fullName };
      });
      return changed ? { ...current, items } : current;
    },
  );

  const threadKey = messageKeys.thread(userId, identity.playerId);
  const currentThread = queryClient.getQueryData<ThreadResponse>(threadKey);
  const currentPeer = currentThread?.peer;
  if (
    currentThread != null &&
    !(
      currentPeer?.player_id === identity.playerId &&
      currentPeer.full_name === fullName &&
      currentPeer.avatar === avatar
    )
  ) {
    queryClient.setQueryData<ThreadResponse>(threadKey, {
      ...currentThread,
      peer: { player_id: identity.playerId, full_name: fullName, avatar },
    });
  }

  queryClient.setQueryData<Player>(
    messageKeys.peer(userId, identity.playerId),
    (current) => {
      if (current == null) return current;
      if (
        current.name === fullName &&
        current.full_name === fullName &&
        current.avatar === avatar &&
        current.profile_picture_url === avatar
      ) {
        return current;
      }
      return {
          ...current,
          name: fullName,
          full_name: fullName,
          avatar,
          profile_picture_url: avatar,
      };
    },
  );

  queryClient.setQueryData<PlayerProfileDetails>(
    socialKeys.profile(userId, identity.playerId),
    (current) => {
      if (current == null) return current;
      const player = current.player;
      if (
        player.name === fullName &&
        player.full_name === fullName &&
        player.avatar === avatar &&
        player.profile_picture_url === avatar
      ) {
        return current;
      }
      return {
          ...current,
          player: {
            ...player,
            name: fullName,
            full_name: fullName,
            avatar,
            profile_picture_url: avatar,
          },
      };
    },
  );
}

interface MessageUnreadCountCache {
  readonly count: number;
  readonly __optimisticDeltas?: Readonly<Record<string, number>>;
}

interface SocketReceiptCache {
  readonly messageIds: readonly number[];
}

const MAX_SOCKET_RECEIPTS = 250;

function socketReceiptKey(userId: number) {
  return [...messageKeys.all(userId), 'socket-receipts'] as const;
}

function rememberSocketMessage(
  queryClient: QueryClient,
  userId: number,
  messageId: number,
  alreadyInThread: boolean,
): boolean {
  let alreadyReceived = alreadyInThread;
  queryClient.setQueryData<SocketReceiptCache>(
    socketReceiptKey(userId),
    (current) => {
      if (current?.messageIds.includes(messageId)) {
        alreadyReceived = true;
        return current;
      }
      return {
        messageIds: [messageId, ...(current?.messageIds ?? [])].slice(
          0,
          MAX_SOCKET_RECEIPTS,
        ),
      };
    },
  );
  return alreadyReceived;
}

interface ConversationPatch {
  readonly previous: Conversation;
  readonly optimistic: Conversation & {
    readonly __optimisticReadToken: string;
  };
}

interface ThreadMessagePatch {
  readonly previous: DirectMessage;
  readonly optimistic: DirectMessage;
}

export interface MarkThreadReadPatch {
  readonly token: string;
  readonly playerId: number;
  readonly conversation?: ConversationPatch;
  readonly threadMessages: readonly ThreadMessagePatch[];
  readonly notification?: DirectMessageSummaryPatch;
}

function applyUnreadDelta(
  queryClient: QueryClient,
  userId: number,
  token: string,
  delta: number,
): number | null {
  let remaining: number | null = null;
  queryClient.setQueryData<MessageUnreadCountCache>(
    messageKeys.unreadCount(userId),
    (current) => {
      if (current == null) return current;
      const nextCount = Math.max(0, current.count + delta);
      const appliedDelta = nextCount - current.count;
      remaining = nextCount;
      return {
        ...current,
        count: nextCount,
        ...(appliedDelta !== 0
          ? {
              __optimisticDeltas: {
                ...current.__optimisticDeltas,
                [token]: appliedDelta,
              },
            }
          : {}),
      };
    },
  );
  return remaining;
}

function finishUnreadDelta(
  queryClient: QueryClient,
  userId: number,
  token: string,
  restore: boolean,
): void {
  queryClient.setQueryData<MessageUnreadCountCache>(
    messageKeys.unreadCount(userId),
    (current) => {
      const delta = current?.__optimisticDeltas?.[token];
      if (current == null || delta == null) return current;
      const { [token]: _removed, ...remainingDeltas } =
        current.__optimisticDeltas ?? {};
      return {
        count: Math.max(0, current.count + (restore ? -delta : 0)),
        ...(Object.keys(remainingDeltas).length > 0
          ? { __optimisticDeltas: remainingDeltas }
          : {}),
      };
    },
  );
}

function deriveUnreadMessages(
  conversation: Conversation | undefined,
  thread: ThreadResponse | undefined,
  playerId: number,
): number {
  if (conversation != null) return conversation.unread_count;
  return (thread?.items ?? []).filter(
    (message) => message.sender_player_id === playerId && !message.is_read,
  ).length;
}

export function applyMarkThreadRead(
  queryClient: QueryClient,
  userId: number,
  playerId: number,
  token: string,
): MarkThreadReadPatch {
  const conversationsKey = messageKeys.conversations(userId);
  const threadKey = messageKeys.thread(userId, playerId);
  const conversations =
    queryClient.getQueryData<ConversationListResponse>(conversationsKey);
  const thread = queryClient.getQueryData<ThreadResponse>(threadKey);
  const previousConversation = conversations?.items.find(
    (conversation) => conversation.player_id === playerId,
  );
  const unreadMessages = deriveUnreadMessages(
    previousConversation,
    thread,
    playerId,
  );

  let conversation: ConversationPatch | undefined;
  if (previousConversation != null && previousConversation.unread_count > 0) {
    const optimistic: ConversationPatch['optimistic'] = {
      ...previousConversation,
      unread_count: 0,
      __optimisticReadToken: token,
    };
    queryClient.setQueryData<ConversationListResponse>(
      conversationsKey,
      (current) =>
        current == null
          ? current
          : {
              ...current,
              items: current.items.map((candidate) =>
                candidate === previousConversation ? optimistic : candidate,
              ),
            },
    );
    conversation = { previous: previousConversation, optimistic };
  }

  const threadMessages: ThreadMessagePatch[] = [];
  queryClient.setQueryData<ThreadResponse>(threadKey, (current) =>
    current == null
      ? current
      : {
          ...current,
          items: current.items.map((message) => {
            if (message.sender_player_id !== playerId || message.is_read) {
              return message;
            }
            const optimistic: DirectMessage = {
              ...message,
              is_read: true,
              read_at: `optimistic:${token}`,
            };
            threadMessages.push({ previous: message, optimistic });
            return optimistic;
          }),
        },
  );

  const remainingUnread = applyUnreadDelta(
    queryClient,
    userId,
    token,
    -unreadMessages,
  );
  const notification =
    remainingUnread == null
      ? undefined
      : applyDirectMessageSummaryRead(
          queryClient,
          userId,
          remainingUnread,
          token,
        );

  return {
    token,
    playerId,
    conversation,
    threadMessages,
    notification,
  };
}

export function rollbackMarkThreadRead(
  queryClient: QueryClient,
  userId: number,
  patch: MarkThreadReadPatch | undefined,
): void {
  if (patch == null) return;
  if (patch.conversation != null) {
    const conversationPatch = patch.conversation;
    queryClient.setQueryData<ConversationListResponse>(
      messageKeys.conversations(userId),
      (current) =>
        current == null
          ? current
          : {
              ...current,
              items: current.items.map((conversation) =>
                (
                  conversation as Conversation & {
                    readonly __optimisticReadToken?: string;
                  }
                ).__optimisticReadToken === patch.token
                  ? conversationPatch.previous
                  : conversation,
              ),
            },
    );
  }
  const byId = new Map(
    patch.threadMessages.map((entry) => [entry.previous.id, entry]),
  );
  queryClient.setQueryData<ThreadResponse>(
    messageKeys.thread(userId, patch.playerId),
    (current) =>
      current == null
        ? current
        : {
            ...current,
            items: current.items.map((message) => {
              const entry = byId.get(message.id);
              return entry != null &&
                message.read_at === `optimistic:${patch.token}`
                ? entry.previous
                : message;
            }),
          },
  );
  finishUnreadDelta(queryClient, userId, patch.token, true);
  rollbackDirectMessageSummaryRead(queryClient, userId, patch.notification);
}

export function commitMarkThreadRead(
  queryClient: QueryClient,
  userId: number,
  patch: MarkThreadReadPatch | undefined,
): void {
  if (patch == null) return;
  const committedAt = new Date().toISOString();
  queryClient.setQueryData<ConversationListResponse>(
    messageKeys.conversations(userId),
    (current) =>
      current == null
        ? current
        : {
            ...current,
            items: current.items.map((conversation) => {
              const optimistic = conversation as Conversation & {
                readonly __optimisticReadToken?: string;
              };
              if (optimistic.__optimisticReadToken !== patch.token) {
                return conversation;
              }
              const {
                __optimisticReadToken: _optimisticReadToken,
                ...committed
              } = optimistic;
              return committed;
            }),
          },
  );
  const byId = new Map(
    patch.threadMessages.map((entry) => [entry.previous.id, entry]),
  );
  queryClient.setQueryData<ThreadResponse>(
    messageKeys.thread(userId, patch.playerId),
    (current) =>
      current == null
        ? current
        : {
            ...current,
            items: current.items.map((message) => {
              const entry = byId.get(message.id);
              return entry != null &&
                message.read_at === `optimistic:${patch.token}`
                ? { ...message, read_at: committedAt }
                : message;
            }),
          },
  );
  finishUnreadDelta(queryClient, userId, patch.token, false);
  commitDirectMessageSummaryRead(queryClient, userId, patch.notification);
}

export function upsertThreadMessage(
  current: ThreadResponse | undefined,
  message: DirectMessage,
): ThreadResponse | undefined {
  if (current == null) return current;
  const withoutMessage = current.items.filter(
    (candidate) => candidate.id !== message.id,
  );
  return {
    ...current,
    items: [message, ...withoutMessage],
    total_count: current.items.some((candidate) => candidate.id === message.id)
      ? current.total_count
      : current.total_count + 1,
  };
}

export function getSocketDirectMessage(value: unknown): DirectMessage | null {
  if (value == null || typeof value !== 'object') return null;
  const event = value as Record<string, unknown>;
  if (event.type !== 'direct_message') return null;
  const message = event.message;
  if (message == null || typeof message !== 'object') return null;
  return typeof (message as { id?: unknown }).id === 'number'
    ? (message as DirectMessage)
    : null;
}

/** Reconcile the receiver-only direct-message WebSocket event into Query. */
export function reconcileDirectMessageEvent(
  queryClient: QueryClient,
  userId: number,
  message: DirectMessage,
): void {
  const conversationsKey = messageKeys.conversations(userId);
  const threadKey = messageKeys.thread(userId, message.sender_player_id);
  const current =
    queryClient.getQueryData<ConversationListResponse>(conversationsKey);
  const existing = current?.items.find(
    (conversation) => conversation.player_id === message.sender_player_id,
  );
  const currentThread = queryClient.getQueryData<ThreadResponse>(threadKey);
  const alreadyReceived = rememberSocketMessage(
    queryClient,
    userId,
    message.id,
    currentThread?.items.some((candidate) => candidate.id === message.id) ??
      false,
  );
  const canApplyUnreadDelta = !alreadyReceived && currentThread != null;

  if (canApplyUnreadDelta && current != null && existing != null) {
    const { __optimisticReadToken: _optimisticReadToken, ...stableExisting } =
      existing as Conversation & {
        readonly __optimisticReadToken?: string;
      };
    const updated: Conversation = {
      ...stableExisting,
      last_message_text: message.message_text,
      last_message_at: message.created_at,
      last_message_sender_id: message.sender_player_id,
      unread_count: existing.unread_count + 1,
    };
    queryClient.setQueryData<ConversationListResponse>(conversationsKey, {
      ...current,
      items: [
        updated,
        ...current.items.filter((conversation) => conversation !== existing),
      ],
    });
  }

  queryClient.setQueryData<ThreadResponse>(threadKey, (thread) =>
    upsertThreadMessage(thread, message),
  );
  if (canApplyUnreadDelta) {
    queryClient.setQueryData<MessageUnreadCountCache>(
      messageKeys.unreadCount(userId),
      (count) => (count == null ? count : { ...count, count: count.count + 1 }),
    );
  }

  void queryClient.invalidateQueries({
    queryKey: conversationsKey,
    refetchType: existing == null ? 'active' : 'none',
  });
  void queryClient.invalidateQueries({
    queryKey: messageKeys.unreadCount(userId),
    // Without a hydrated thread we cannot know whether this ID was already
    // reflected in the authoritative count (for example after reconnect).
    refetchType:
      !alreadyReceived && currentThread == null ? 'active' : 'none',
  });
}
