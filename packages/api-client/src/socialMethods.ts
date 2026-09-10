import type { AxiosInstance } from "axios";
import { getRead, withRequestDeadline, type ReadRequestOptions } from './readRequest';
import type {
  DiscoverFilters,
  DiscoverPlayer,
  Friend,
  FriendBatchStatusResponse,
  FriendListResponse,
  FriendRequest,
  FriendRequestDirection,
  FriendshipRelationship,
  FriendshipStatus,
  MutualFriend,
} from "@beach-kings/shared";
import { normalizeItems } from "./responseNormalization";

export interface FriendListParams {
  readonly page?: number;
  readonly page_size?: number;
}

interface RawDiscoverPlayer {
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
  readonly friend_status?: FriendshipStatus | "pending";
  readonly request_id?: number | null;
  readonly friend_request_id?: number | null;
}

interface RawFriendSuggestion {
  readonly id?: number;
  readonly player_id: number;
  readonly full_name: string;
  readonly avatar?: string | null;
  readonly location_name?: string | null;
  readonly level?: Friend["level"];
  readonly shared_league_name?: string | null;
}

interface RawBatchStatusResponse {
  readonly statuses?: Record<string, FriendshipStatus>;
  readonly relationships?: Record<string, FriendshipRelationship>;
  readonly mutual_counts?: Record<string, number>;
}

function normalizeDiscoverPlayer(
  item: RawDiscoverPlayer,
): DiscoverPlayer | null {
  const playerId = item.player_id ?? item.id;
  if (!Number.isInteger(playerId) || (playerId ?? 0) <= 0) return null;

  const legacyStatus =
    item.friend_status === "pending" ? "pending_outgoing" : item.friend_status;
  const requestId = item.request_id ?? item.friend_request_id;

  return {
    player_id: playerId as number,
    full_name: item.full_name ?? "",
    avatar: item.avatar ?? null,
    city: item.city ?? item.location_name ?? null,
    level: item.level ?? null,
    games_played: item.games_played ?? item.total_games ?? 0,
    mutual_friends_count:
      item.mutual_friends_count ?? item.mutual_friend_count ?? 0,
    last_active_label: item.last_active_label ?? null,
    friend_status: legacyStatus ?? "none",
    ...(requestId != null ? { request_id: requestId } : {}),
  };
}

function normalizeFriendSuggestion(item: RawFriendSuggestion): Friend | null {
  if (!Number.isInteger(item.player_id) || item.player_id <= 0) return null;
  return {
    id: item.id ?? item.player_id,
    player_id: item.player_id,
    full_name: item.full_name,
    avatar: item.avatar ?? null,
    location_name: item.location_name ?? null,
    level: item.level ?? null,
    shared_league_name: item.shared_league_name ?? null,
  };
}

function normalizeBatchStatus(
  response: RawBatchStatusResponse,
): FriendBatchStatusResponse {
  const statuses = { ...(response.statuses ?? {}) };
  const relationships: Record<string, FriendshipRelationship> = {};

  Object.entries(statuses).forEach(([playerId, status]) => {
    relationships[playerId] = { status, request_id: null };
  });
  Object.entries(response.relationships ?? {}).forEach(
    ([playerId, relationship]) => {
      relationships[playerId] = {
        status: relationship.status,
        request_id: relationship.request_id ?? null,
      };
      statuses[playerId] = relationship.status;
    },
  );

  return {
    statuses,
    relationships,
    mutual_counts: { ...(response.mutual_counts ?? {}) },
  };
}

export function createSocialMethods(api: AxiosInstance) {
  async function getFriendsPage(
    params: FriendListParams = {},
    options?: ReadRequestOptions,
  ): Promise<FriendListResponse> {
    const response = await getRead<FriendListResponse | Friend[]>(api,
      "/api/friends",
      { params },
      options,
    );
    const items = normalizeItems(response.data);
    return {
      items,
      total_count:
        Array.isArray(response.data) ||
        typeof response.data.total_count !== "number"
          ? items.length
          : response.data.total_count,
    };
  }

  return {
    getFriendsPage,

    async getFriends(params?: FriendListParams, options?: ReadRequestOptions): Promise<Friend[]> {
      return (await getFriendsPage(params, options)).items;
    },

    async getFriendRequests(
      direction?: FriendRequestDirection,
      options?: ReadRequestOptions,
    ): Promise<FriendRequest[]> {
      const params = direction ? { direction } : {};
      const response = await getRead<
        { items?: FriendRequest[] } | FriendRequest[]
      >(api, "/api/friends/requests", { params }, options);
      return normalizeItems(response.data);
    },

    async sendFriendRequest(receiverPlayerId: number) {
      const response = await api.post("/api/friends/request", {
        receiver_player_id: receiverPlayerId,
      });
      return response.data;
    },

    async acceptFriendRequest(requestId: number) {
      const response = await api.post(
        `/api/friends/requests/${requestId}/accept`,
      );
      return response.data;
    },

    async declineFriendRequest(requestId: number) {
      const response = await api.post(
        `/api/friends/requests/${requestId}/decline`,
      );
      return response.data;
    },

    async cancelFriendRequest(requestId: number) {
      const response = await api.delete(`/api/friends/requests/${requestId}`);
      return response.data;
    },

    async removeFriend(playerIdToRemove: number) {
      const response = await api.delete(`/api/friends/${playerIdToRemove}`);
      return response.data;
    },

    async getFriendSuggestions(options?: ReadRequestOptions): Promise<Friend[]> {
      const response = await getRead<
        { items?: RawFriendSuggestion[] } | RawFriendSuggestion[]
      >(api, "/api/friends/suggestions", undefined, options);
      return normalizeItems(response.data)
        .map(normalizeFriendSuggestion)
        .filter((item): item is Friend => item != null);
    },

    async batchFriendStatus(
      playerIds: number[],
      options?: ReadRequestOptions,
    ): Promise<FriendBatchStatusResponse> {
      // This POST is a read-only status lookup; mutation budgets stay unchanged.
      const request = (signal?: AbortSignal, timeout?: number) => api.post<RawBatchStatusResponse>(
        "/api/friends/batch-status",
        {
          player_ids: playerIds,
        },
        ...(signal ? [{ signal, timeout }] : []),
      );
      const response = await (options ? withRequestDeadline(request, options) : request());
      return normalizeBatchStatus(response.data);
    },

    async getMutualFriends(otherPlayerId: number, options?: ReadRequestOptions): Promise<MutualFriend[]> {
      const response = await getRead<
        { items?: MutualFriend[] } | MutualFriend[]
      >(api, `/api/friends/mutual/${otherPlayerId}`, undefined, options);
      return normalizeItems(response.data);
    },

    async discoverPlayers(
      params: DiscoverFilters = {},
      options?: ReadRequestOptions,
    ): Promise<DiscoverPlayer[]> {
      const response = await getRead<
        { items?: RawDiscoverPlayer[] } | RawDiscoverPlayer[]
      >(api, "/api/friends/discover", { params }, options);
      return normalizeItems(response.data)
        .map(normalizeDiscoverPlayer)
        .filter((item): item is DiscoverPlayer => item != null);
    },
  };
}
