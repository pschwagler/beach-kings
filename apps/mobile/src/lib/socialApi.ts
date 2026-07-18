import type {
  Friend,
  FriendRequest,
  FriendshipStatus,
  Notification,
} from '@beach-kings/shared';
import { api } from '@/lib/api';
import type { DiscoverFilters } from '@/lib/socialQueryKeys';

export interface DiscoverPlayer {
  readonly player_id: number;
  readonly full_name: string;
  readonly avatar: string | null;
  readonly city: string | null;
  readonly level: string | null;
  readonly games_played: number;
  readonly mutual_friends_count: number;
  readonly last_active_label: string | null;
  readonly friend_status: FriendshipStatus;
  readonly request_id?: number | null;
}

interface RawDiscoverItem {
  readonly id?: number;
  readonly player_id?: number;
  readonly full_name?: string | null;
  readonly avatar?: string | null;
  readonly city?: string | null;
  readonly location_name?: string | null;
  readonly level?: string | null;
  readonly games_played?: number;
  readonly total_games?: number;
  readonly mutual_friends_count?: number;
  readonly mutual_friend_count?: number;
  readonly last_active_label?: string | null;
  readonly friend_status?: FriendshipStatus | 'pending';
  readonly request_id?: number | null;
  readonly friend_request_id?: number | null;
}

/** Normalize list envelopes once at the API boundary, not in every screen. */
export function normalizeList<T>(response: { readonly items?: T[] } | T[] | null | undefined): T[] {
  if (response == null) return [];
  return Array.isArray(response) ? response : (response.items ?? []);
}

export function normalizeDiscoverPlayer(item: RawDiscoverItem): DiscoverPlayer {
  const legacyStatus = item.friend_status === 'pending'
    ? 'pending_outgoing'
    : item.friend_status;
  return {
    player_id: item.player_id ?? item.id ?? 0,
    full_name: item.full_name ?? '',
    avatar: item.avatar ?? null,
    city: item.city ?? item.location_name ?? null,
    level: item.level ?? null,
    games_played: item.games_played ?? item.total_games ?? 0,
    mutual_friends_count:
      item.mutual_friends_count ?? item.mutual_friend_count ?? 0,
    last_active_label: item.last_active_label ?? null,
    friend_status: legacyStatus ?? 'none',
    ...((item.request_id ?? item.friend_request_id) != null
      ? { request_id: item.request_id ?? item.friend_request_id }
      : {}),
  };
}

export const socialApi = {
  async getFriends(): Promise<Friend[]> {
    return normalizeList(await api.getFriends());
  },

  async getFriendRequests(direction: 'incoming' | 'outgoing' | 'both'): Promise<FriendRequest[]> {
    return normalizeList(await api.getFriendRequests(direction));
  },

  async getFriendSuggestions(): Promise<Friend[]> {
    return normalizeList(await api.getFriendSuggestions());
  },

  async discoverPlayers(filters: DiscoverFilters): Promise<DiscoverPlayer[]> {
    const response = await api.discoverPlayers({ ...filters });
    return normalizeList<RawDiscoverItem>(response).map(normalizeDiscoverPlayer);
  },

  async getNotifications(): Promise<Notification[]> {
    const notifications = normalizeList<Notification>(await api.getNotifications());
    return notifications.filter((notification) => notification.dismissed_at == null);
  },
};
