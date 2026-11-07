import React, { type PropsWithChildren } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { api } from "@/lib/api";
import { useScoresheetScreen } from "@/components/screens/Scoresheets/useScoresheetScreen";

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: 7 } }),
}));
jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
}));
jest.mock("@/lib/api", () => ({
  api: {
    getUserLeagues: jest.fn(),
    getLeague: jest.fn(),
    getLeagueSeasons: jest.fn(),
    getLeagueMembers: jest.fn(),
    uploadScoresheet: jest.fn(),
    getScoresheetJob: jest.fn(),
    editScoresheet: jest.fn(),
    confirmScoresheet: jest.fn(),
  },
}));
const match = {
  number: 1,
  scores: [21, 19],
  players: [1, 2, 3, 4].map((id) => ({
    id,
    name: `Player ${id}`,
    rawName: `Player ${id}`,
  })),
};
const clients: QueryClient[] = [];
function setup(leagueId: number | null = 10) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { gcTime: 0 },
    },
  });
  clients.push(client);
  const invalidate = jest.spyOn(client, "invalidateQueries");
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return {
    ...renderHook(() => useScoresheetScreen(leagueId), { wrapper: Wrapper }),
    client,
    invalidate,
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(api.getUserLeagues)
    .mockResolvedValue([
      { id: 10, name: "Test League", current_season_id: 20 },
    ] as never);
  jest.mocked(api.getLeague).mockResolvedValue({
    id: 10,
    name: "Test League",
    current_season_id: 20,
  } as never);
  jest.mocked(api.getLeagueSeasons).mockResolvedValue([]);
  jest.mocked(api.getLeagueMembers).mockResolvedValue([]);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [
      {
        uri: "file:///sheet.jpg",
        mimeType: "image/jpeg",
        fileName: "sheet.jpg",
      },
    ],
  } as never);
  jest
    .mocked(api.uploadScoresheet)
    .mockResolvedValue({ job_id: 30, session_id: "draft", status: "PENDING" });
  jest.mocked(api.getScoresheetJob).mockResolvedValue({
    job_id: 30,
    status: "COMPLETED",
    result: {
      status: "success",
      matches: [match],
      clarification: null,
      error: null,
    },
  } as never);
  jest
    .mocked(api.confirmScoresheet)
    .mockResolvedValue({ match_ids: [100], matches_created: 1 });
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
});

test("photo selection and parsing never save games; confirmation sends reviewed context and invalidates this account", async () => {
  const { result, invalidate } = setup();
  await waitFor(() => expect(result.current.league).toBeDefined());
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  await act(async () => {
    await result.current.upload();
  });
  await waitFor(() => expect(result.current.matches).toHaveLength(1));
  expect(api.confirmScoresheet).not.toHaveBeenCalled();
  expect(result.current.issue).toBeNull();
  await act(async () => {
    result.current.setSeasonId(null);
    result.current.setDate("2026-11-01");
  });
  await act(async () => {
    await result.current.confirm();
  });
  await waitFor(() => expect(result.current.confirmed).toBe(true));
  expect(api.confirmScoresheet).toHaveBeenCalledWith(
    10,
    "draft",
    null,
    "2026-11-01",
    [],
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["private", 7, "leagues"],
  });
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["private", 7, "sessions"],
  });
  expect(
    invalidate.mock.calls.every(([filters]) => filters?.queryKey?.[1] === 7),
  ).toBe(true);
});

test("keeps the photo after upload fails and rejects unresolved players before confirmation", async () => {
  jest.mocked(api.uploadScoresheet).mockRejectedValueOnce(new Error("offline"));
  const { result } = setup();
  await waitFor(() => expect(result.current.league).toBeDefined());
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  await act(async () => {
    await result.current.upload();
  });
  expect(result.current.photo?.uri).toBe("file:///sheet.jpg");
  expect(result.current.uploaded).toBe(false);
  expect(result.current.error).toBeTruthy();
  jest.mocked(api.getScoresheetJob).mockResolvedValue({
    job_id: 30,
    status: "COMPLETED",
    result: {
      status: "needs_clarification",
      matches: [
        {
          ...match,
          players: [
            { id: null, name: "Sam", rawName: "Sam" },
            ...match.players.slice(1),
          ],
        },
      ],
      clarification: "Who is Sam?",
      error: null,
    },
  } as never);
  await act(async () => {
    await result.current.upload();
  });
  await waitFor(() => expect(result.current.unresolved).toEqual(["Sam"]));
  await act(async () => {
    await result.current.confirm();
  });
  expect(api.confirmScoresheet).not.toHaveBeenCalled();
  act(() => result.current.resolve("Sam", 8, "Samuel"));
  await act(async () => {
    await result.current.confirm();
  });
  expect(api.confirmScoresheet).toHaveBeenCalledWith(
    10,
    "draft",
    20,
    expect.any(String),
    [{ raw_name: "Sam", player_id: 8, player_name: "Samuel" }],
  );
});

test("corrections start from the reviewed players and scores, and can replace a prior identity", async () => {
  const sam = { id: null, name: "Sam", rawName: "Sam" };
  const original = { ...match, players: [sam, ...match.players.slice(1)] };
  jest
    .mocked(api.getScoresheetJob)
    .mockResolvedValue({
      job_id: 30,
      status: "COMPLETED",
      result: {
        status: "needs_clarification",
        matches: [original],
        clarification: "Who is Sam?",
        error: null,
      },
    } as never);
  jest
    .mocked(api.editScoresheet)
    .mockResolvedValueOnce({
      job_id: 31,
      session_id: "draft",
      status: "PENDING",
    });
  const { result } = setup();
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  await act(async () => {
    await result.current.upload();
  });
  await waitFor(() => expect(result.current.unresolved).toEqual(["Sam"]));
  act(() => {
    result.current.resolve("Sam", 8, "Samuel");
    result.current.setEditPrompt("Game 1 finished 21 to 17");
  });
  const reviewed = result.current.matches;
  expect(reviewed[0]?.players[0]?.id).toBe(8);
  const corrected = { ...reviewed[0], scores: [21, 17] };
  jest
    .mocked(api.getScoresheetJob)
    .mockResolvedValue({
      job_id: 31,
      status: "COMPLETED",
      result: {
        status: "success",
        matches: [corrected],
        clarification: null,
        error: null,
      },
    } as never);
  await act(async () => {
    await result.current.edit();
  });
  expect(api.editScoresheet).toHaveBeenLastCalledWith(
    10,
    "draft",
    "Game 1 finished 21 to 17",
    reviewed,
  );
  await waitFor(() =>
    expect(result.current.matches[0]?.scores).toEqual([21, 17]),
  );
  expect(result.current.unresolved).toEqual([]);
  expect(result.current.matches[0]?.players[0]?.id).toBe(8);

  // A subsequent identity correction takes precedence over the old selection.
  jest
    .mocked(api.editScoresheet)
    .mockResolvedValueOnce({
      job_id: 32,
      session_id: "draft",
      status: "PENDING",
    });
  const replacement = {
    ...corrected,
    players: [
      { id: 9, name: "Other Samuel", rawName: "Sam" },
      ...match.players.slice(1),
    ],
  };
  jest
    .mocked(api.getScoresheetJob)
    .mockResolvedValue({
      job_id: 32,
      status: "COMPLETED",
      result: {
        status: "success",
        matches: [replacement],
        clarification: null,
        error: null,
      },
    } as never);
  act(() => result.current.setEditPrompt("Sam is Other Samuel"));
  await act(async () => {
    await result.current.edit();
  });
  expect(api.editScoresheet).toHaveBeenLastCalledWith(
    10,
    "draft",
    "Sam is Other Samuel",
    [corrected],
  );
  await waitFor(() =>
    expect(result.current.matches[0]?.players[0]?.id).toBe(9),
  );
  expect(result.current.matches[0]?.scores).toEqual([21, 17]);
  await act(async () => {
    await result.current.confirm();
  });
  expect(api.confirmScoresheet).toHaveBeenCalledWith(
    10,
    "draft",
    20,
    expect.any(String),
    [],
  );
});

test("a canceled picker preserves the previous image; oversized images never upload", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.league).toBeDefined());
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValueOnce({
    canceled: false,
    assets: [
      {
        uri: "file:///large.jpg",
        mimeType: "image/jpeg",
        fileSize: 11 * 1024 * 1024,
      },
    ],
  } as never);
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  expect(result.current.photo).toBeNull();
  expect(result.current.error).toContain("10 MB");
  await act(async () => {
    await result.current.upload();
  });
  expect(api.uploadScoresheet).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  jest
    .mocked(ImagePicker.launchImageLibraryAsync)
    .mockResolvedValueOnce({ canceled: true, assets: null });
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  expect(result.current.photo?.uri).toBe("file:///sheet.jpg");
});

test("uses the same authoritative current season as adding a game in league detail", async () => {
  jest.mocked(api.getLeague).mockResolvedValue({
    id: 10,
    name: "Test League",
    current_season_id: 22,
  } as never);
  const { result } = setup();
  await waitFor(() => expect(result.current.seasonId).toBe(22));
  act(() => result.current.setSeasonId(null));
  expect(result.current.seasonId).toBeNull();
});

test("pickup parsing and saving work without loading leagues or seasons", async () => {
  jest.mocked(api.getUserLeagues).mockRejectedValue(new Error("offline"));
  jest.mocked(api.confirmScoresheet).mockResolvedValue({
    match_ids: [100],
    matches_created: 1,
    session_id: 90,
  });
  const { result } = setup(null);
  await act(async () => {
    await result.current.choosePhoto(false);
  });
  expect(result.current.gameType).toBeNull();
  await act(async () => {
    await result.current.upload();
  });
  expect(api.uploadScoresheet).not.toHaveBeenCalled();
  act(() => result.current.chooseGameType("pickup"));
  await act(async () => {
    await result.current.upload();
  });
  expect(api.uploadScoresheet).toHaveBeenCalledWith(
    null,
    expect.any(Object),
    "",
    null,
  );
  await waitFor(() => expect(result.current.matches).toHaveLength(1));
  expect(api.getScoresheetJob).toHaveBeenCalledWith(
    null,
    30,
    expect.any(Object),
  );
  expect(api.getLeagueSeasons).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.confirm();
  });
  expect(api.confirmScoresheet).toHaveBeenCalledWith(
    null,
    "draft",
    null,
    expect.any(String),
    [],
  );
  await waitFor(() => expect(result.current.savedSessionId).toBe(90));
});

test("league choice needs a selected league; switching to pickup clears the league and season", async () => {
  const { result } = setup(null);
  act(() => result.current.chooseGameType("league"));
  expect(result.current.contextReady).toBe(false);
  act(() => result.current.chooseLeague(10));
  await waitFor(() => expect(result.current.seasonId).toBe(20));
  expect(result.current.contextReady).toBe(true);
  act(() => result.current.chooseGameType("pickup"));
  expect(result.current.leagueId).toBe(0);
  expect(result.current.seasonId).toBeNull();
  expect(result.current.contextReady).toBe(true);
});
