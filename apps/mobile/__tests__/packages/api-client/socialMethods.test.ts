import { createApiMethods } from "../../../../../packages/api-client/src/methods";
import type { ApiClient } from "../../../../../packages/api-client/src/client";

function makeClient(overrides: Record<string, jest.Mock>): ApiClient {
  return {
    axiosInstance: {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
      ...overrides,
    },
  } as unknown as ApiClient;
}

const FRIEND = {
  id: 1,
  player_id: 2,
  full_name: "Alex Ace",
  avatar: null,
  location_name: "Ocean Beach",
  level: "AA" as const,
};

describe("social API response contracts", () => {
  it("normalizes friends, requests, and suggestions to canonical arrays", async () => {
    const get = jest
      .fn()
      .mockResolvedValueOnce({ data: { items: [FRIEND], total_count: 1 } })
      .mockResolvedValueOnce({ data: [{ id: 8 }] })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              player_id: 4,
              full_name: "Sam Sand",
              avatar: null,
              location_name: null,
              level: "Open",
            },
          ],
        },
      });
    const methods = createApiMethods(makeClient({ get }));

    await expect(
      methods.getFriends({ page: 2, page_size: 25 }),
    ).resolves.toEqual([FRIEND]);
    await expect(methods.getFriendRequests("incoming")).resolves.toEqual([
      { id: 8 },
    ]);
    await expect(methods.getFriendSuggestions()).resolves.toEqual([
      {
        id: 4,
        player_id: 4,
        full_name: "Sam Sand",
        avatar: null,
        location_name: null,
        level: "Open",
        shared_league_name: null,
      },
    ]);
    expect(get).toHaveBeenNthCalledWith(1, "/api/friends", {
      params: { page: 2, page_size: 25 },
    });
  });

  it("preserves friends pagination metadata for count consumers", async () => {
    const get = jest.fn().mockResolvedValue({
      data: { items: [FRIEND], total_count: 47 },
    });
    const methods = createApiMethods(makeClient({ get }));

    await expect(
      methods.getFriendsPage({ page: 1, page_size: 1 }),
    ).resolves.toEqual({
      items: [FRIEND],
      total_count: 47,
    });
  });

  it("adapts legacy bare friends arrays into a page response", async () => {
    const get = jest.fn().mockResolvedValue({ data: [FRIEND] });
    const methods = createApiMethods(makeClient({ get }));

    await expect(methods.getFriendsPage()).resolves.toEqual({
      items: [FRIEND],
      total_count: 1,
    });
  });

  it("normalizes discovery aliases and filters malformed player IDs", async () => {
    const get = jest.fn().mockResolvedValue({
      data: {
        items: [
          {
            id: 17,
            full_name: "Casey Court",
            avatar: null,
            location_name: "Brooklyn",
            level: "advanced",
            total_games: 12,
            mutual_friend_count: 3,
            friend_status: "pending",
            friend_request_id: 44,
          },
          { id: 0, full_name: "Invalid zero" },
          { full_name: "Missing id" },
        ],
      },
    });
    const methods = createApiMethods(makeClient({ get }));

    await expect(
      methods.discoverPlayers({ has_mutuals: true }),
    ).resolves.toEqual([
      {
        player_id: 17,
        full_name: "Casey Court",
        avatar: null,
        city: "Brooklyn",
        level: "advanced",
        games_played: 12,
        mutual_friends_count: 3,
        last_active_label: null,
        friend_status: "pending_outgoing",
        request_id: 44,
      },
    ]);
    expect(get).toHaveBeenCalledWith("/api/friends/discover", {
      params: { has_mutuals: true },
    });
  });

  it("derives canonical relationships from legacy batch statuses", async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        statuses: { "2": "friend", "3": "pending_incoming" },
        mutual_counts: { "2": 4 },
      },
    });
    const methods = createApiMethods(makeClient({ post }));

    await expect(methods.batchFriendStatus([2, 3])).resolves.toEqual({
      statuses: { "2": "friend", "3": "pending_incoming" },
      relationships: {
        "2": { status: "friend", request_id: null },
        "3": { status: "pending_incoming", request_id: null },
      },
      mutual_counts: { "2": 4 },
    });
  });

  it("lets rich relationships override and complete legacy statuses", async () => {
    const post = jest.fn().mockResolvedValue({
      data: {
        statuses: { "2": "none" },
        relationships: {
          "2": { status: "pending_outgoing", request_id: 91 },
          "3": { status: "friend" },
        },
      },
    });
    const methods = createApiMethods(makeClient({ post }));

    const result = await methods.batchFriendStatus([2, 3]);
    expect(result.statuses).toEqual({ "2": "pending_outgoing", "3": "friend" });
    expect(result.relationships).toEqual({
      "2": { status: "pending_outgoing", request_id: 91 },
      "3": { status: "friend", request_id: null },
    });
  });
});
