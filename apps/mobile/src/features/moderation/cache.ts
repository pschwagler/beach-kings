import type {
  ConversationListResponse,
  DirectMessage,
  Friend,
  FriendRequest,
  InteractionCapability,
  Notification,
  ThreadResponse,
} from '@beach-kings/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { messageKeys } from '@/features/messages/keys';
import { notificationKeys } from '@/features/notifications/keys';
import { socialKeys } from '@/features/social/keys';
import { moderationKeys } from './keys';

interface CacheEntryPatch {
  readonly queryKey: QueryKey;
  readonly previous: unknown;
  readonly optimistic: unknown;
}

export interface PlayerBlockCachePatch {
  readonly token: string;
  readonly entries: readonly CacheEntryPatch[];
}

function blockedCapability(): InteractionCapability {
  return {
    actions: {
      direct_message: false,
      friend_request: false,
      league_invite: false,
      session_invite: false,
      mention: false,
      reply: false,
      presence: false,
      read_receipt: false,
      notification: false,
      discovery: false,
      user_generated_content: false,
      shared_operational_content: true,
    },
    blocked_by_viewer: true,
    viewer_restricted: false,
  };
}

function notificationPlayerId(notification: Notification): number | null {
  if (notification.actor_player_id != null) return notification.actor_player_id;
  const raw = notification.data?.player_id ?? notification.data?.sender_player_id;
  return typeof raw === 'number' ? raw : null;
}

function remember(
  queryClient: QueryClient,
  entries: CacheEntryPatch[],
  queryKey: QueryKey,
  previous: unknown,
  optimistic: unknown,
): void {
  if (previous === optimistic) return;
  queryClient.setQueryData(queryKey, optimistic);
  // Query applies structural sharing and may replace the value passed above.
  // Capture the actual cache reference so rollback remains ownership-based.
  entries.push({
    queryKey,
    previous,
    optimistic: queryClient.getQueryData(queryKey),
  });
}

/** Remove one player from every private interaction cache immediately. */
export function applyPlayerBlock(
  queryClient: QueryClient,
  userId: number,
  playerId: number,
  token: string,
): PlayerBlockCachePatch {
  const entries: CacheEntryPatch[] = [];

  const relationshipKey = socialKeys.relationship(userId, playerId);
  const relationship = queryClient.getQueryData(relationshipKey);
  if (relationship != null) {
    remember(queryClient, entries, relationshipKey, relationship, {
      status: 'none',
      request_id: null,
    });
  }
  for (const [queryKey, previous] of queryClient.getQueriesData<Friend[]>({
    queryKey: socialKeys.all(userId),
  })) {
    if (!Array.isArray(previous)) continue;
    const optimistic = previous.filter((item) => {
      const friend = item as Friend;
      const request = item as unknown as FriendRequest;
      return friend.player_id !== playerId &&
        request.sender_player_id !== playerId &&
        request.receiver_player_id !== playerId;
    });
    if (optimistic.length !== previous.length) {
      remember(queryClient, entries, queryKey, previous, optimistic);
    }
  }

  const conversationsKey = messageKeys.conversations(userId);
  const conversations = queryClient.getQueryData<ConversationListResponse>(conversationsKey);
  if (conversations != null) {
    const removed = conversations.items.find((item) => item.player_id === playerId);
    const items = conversations.items.filter((item) => item.player_id !== playerId);
    if (items.length !== conversations.items.length) {
      remember(queryClient, entries, conversationsKey, conversations, {
        ...conversations,
        items,
        total_count: Math.max(0, conversations.total_count - 1),
      });
      const unreadKey = messageKeys.unreadCount(userId);
      const unread = queryClient.getQueryData<{ readonly count: number }>(unreadKey);
      if (unread != null && (removed?.unread_count ?? 0) > 0) {
        remember(queryClient, entries, unreadKey, unread, {
          ...unread,
          count: Math.max(0, unread.count - (removed?.unread_count ?? 0)),
        });
      }
    }
  }

  const threadKey = messageKeys.thread(userId, playerId);
  const thread = queryClient.getQueryData<ThreadResponse>(threadKey);
  if (thread != null) {
    remember(queryClient, entries, threadKey, thread, {
      ...thread,
      items: [] as DirectMessage[],
      total_count: 0,
      has_more: false,
      capability: blockedCapability(),
    });
  }

  const feedKey = notificationKeys.feed(userId);
  const feed = queryClient.getQueryData<Notification[]>(feedKey);
  if (feed != null) {
    const optimistic = feed.filter((item) => notificationPlayerId(item) !== playerId);
    if (optimistic.length !== feed.length) {
      remember(queryClient, entries, feedKey, feed, optimistic);
      const countKey = notificationKeys.unreadCount(userId);
      const count = queryClient.getQueryData<{ readonly count: number }>(countKey);
      if (count != null) {
        remember(queryClient, entries, countKey, count, {
          ...count,
          count: Math.max(0, count.count - (feed.length - optimistic.length)),
        });
      }
    }
  }

  for (const [queryKey, previous] of queryClient.getQueriesData<
    Readonly<Record<string, InteractionCapability>>
  >({ queryKey: moderationKeys.capabilitiesRoot(userId) })) {
    if (previous?.[String(playerId)] == null) continue;
    remember(queryClient, entries, queryKey, previous, {
      ...previous,
      [String(playerId)]: blockedCapability(),
    });
  }

  return { token, entries };
}

/** Roll back only values still owned by this mutation's optimistic write. */
export function rollbackPlayerBlock(
  queryClient: QueryClient,
  patch: PlayerBlockCachePatch | undefined,
): void {
  if (patch == null) return;
  for (const entry of patch.entries) {
    if (queryClient.getQueryData(entry.queryKey) === entry.optimistic) {
      queryClient.setQueryData(entry.queryKey, entry.previous);
    }
  }
}
