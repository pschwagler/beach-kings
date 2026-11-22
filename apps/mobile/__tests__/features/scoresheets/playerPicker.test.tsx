import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PlayerSearchItem } from "@beach-kings/shared";
import AddNewPlayerProvider, {
  useAddNewPlayer,
} from "@/contexts/AddNewPlayerContext";
import { useScoresheetPlayerPicker } from "@/components/screens/Scoresheets/useScoresheetPlayerPicker";
import { sessionQueries } from "@/features/sessions";
import { api } from "@/lib/api";

const mockPush = jest.fn();
let mockFocus: (() => void) | null = null;
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useFocusEffect: (callback: () => void) => {
    mockFocus = callback;
  },
}));
jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));
jest.mock("@/lib/api", () => ({
  api: { searchPlayers: jest.fn(), getLeague: jest.fn() },
}));

const member: PlayerSearchItem = {
  id: 1,
  first_name: "Sam",
  last_name: "League",
  full_name: "Sam League",
  nickname: null,
  initials: "SL",
  tags: ["in_league"],
  score: 150,
  in_session: false,
  is_guest: false,
};
const outside: PlayerSearchItem = {
  ...member,
  id: 2,
  full_name: "Sam Other",
  last_name: "Other",
  tags: [],
  score: 0,
};
const clients: QueryClient[] = [];
function setup(
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  }),
) {
  clients.push(client);
  const resolve = jest.fn();
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>
      <AddNewPlayerProvider>{children}</AddNewPlayerProvider>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () => ({
      picker: useScoresheetPlayerPicker(10, "Sam", resolve),
      bridge: useAddNewPlayer(),
    }),
    { wrapper },
  );
  return { ...hook, client, resolve };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(api.searchPlayers)
    .mockResolvedValue({ items: [outside, member] });
  jest
    .mocked(api.getLeague)
    .mockResolvedValue({ id: 10, gender: "mens", level: "advanced" } as never);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

test("uses scoreboard search with league context, exposes both groups, and selects a non-member", async () => {
  const { result, resolve } = setup();
  await waitFor(() =>
    expect(result.current.picker.otherPlayers).toHaveLength(1),
  );
  expect(api.searchPlayers).toHaveBeenCalledWith(
    "Sam",
    { leagueId: 10, limit: 50 },
    { signal: expect.any(AbortSignal) },
  );
  expect(result.current.picker.leaguePlayers).toEqual([member]);
  expect(result.current.picker.otherPlayers).toEqual([outside]);
  act(() => result.current.picker.select(outside));
  expect(resolve).toHaveBeenCalledWith("Sam", 2, "Sam Other");
});

test("shares the scoreboard query cache instead of fetching a separate league roster", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  client.setQueryData(
    sessionQueries.playerSearch(7, null, "Sam", 10).queryKey,
    { items: [member, outside] },
  );
  const { result } = setup(client);
  await waitFor(() =>
    expect(result.current.picker.leaguePlayers).toHaveLength(1),
  );
  expect(api.searchPlayers).not.toHaveBeenCalled();
});

test("returns a created player to the correct extracted name and consumes the result only once", async () => {
  const { result, resolve } = setup();
  await waitFor(() =>
    expect(result.current.picker.leaguePlayers).toHaveLength(1),
  );
  act(() => result.current.picker.create());
  expect(mockPush).toHaveBeenCalledWith("/(stack)/add-new-player");
  expect(result.current.bridge.request).toEqual({
    source: "scoresheet",
    team: 1,
    slot: 0,
    prefillName: "Sam",
    inferredGender: "male",
    inferredLevel: "advanced",
    leagueId: 10,
  });
  act(() => {
    result.current.bridge.setResult({
      source: "scoresheet",
      team: 1,
      slot: 0,
      name: "Sam New",
      player_id: 99,
      invite_url: "https://example.com/invite/test",
    });
    mockFocus?.(); // Mirrors the ref-based handoff from a frozen native formSheet.
  });
  await waitFor(() =>
    expect(resolve).toHaveBeenCalledWith("Sam", 99, "Sam New"),
  );
  act(() => {
    mockFocus?.();
  });
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(result.current.bridge.result).toBeNull();
});

test("debounces typing and then searches the whole player network for the new name", async () => {
  const { result } = setup();
  await waitFor(() =>
    expect(result.current.picker.otherPlayers).toHaveLength(1),
  );
  act(() => result.current.picker.setSearch("Jordan"));
  expect(result.current.picker.otherPlayers).toHaveLength(0);
  await waitFor(() =>
    expect(api.searchPlayers).toHaveBeenCalledWith(
      "Jordan",
      { leagueId: 10, limit: 50 },
      { signal: expect.any(AbortSignal) },
    ),
  );
});
