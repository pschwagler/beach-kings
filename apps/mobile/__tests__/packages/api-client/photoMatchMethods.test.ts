import {
  createPhotoMatchMethods,
  normalizeScoresheetResult,
} from "../../../../../packages/api-client/src/photoMatchMethods";
import type { AxiosInstance } from "axios";

const parsed = {
  status: "needs_clarification",
  clarification_question: "Who is Sam?",
  matches: [
    {
      team1_player1: { id: 10, name: "Original name" },
      team1_player1_id: 10,
      team1_player1_matched: "Alex",
      team1_player2: " Sam ",
      team2_player1: { name: "Chris" },
      team2_player1_id: 12,
      team2_player2: null,
      team1_score: 21,
      team2_score: null,
    },
  ],
};

test("normalizes resolved IDs, raw names, missing names and unreadable scores", () => {
  expect(normalizeScoresheetResult(parsed)).toEqual({
    status: "needs_clarification",
    clarification: "Who is Sam?",
    error: null,
    matches: [
      {
        number: 1,
        scores: [21, null],
        players: [
          { id: 10, name: "Alex", rawName: "Original name" },
          { id: null, name: "Sam", rawName: "Sam" },
          { id: 12, name: "Chris", rawName: "Chris" },
          { id: null, name: "Unknown player", rawName: "" },
        ],
      },
    ],
  });
  expect(normalizeScoresheetResult(null)).toBeNull();
  expect(
    normalizeScoresheetResult({ status: "FAILED", error_message: "Unreadable" })
      ?.error,
  ).toBe("Unreadable");
});

test("uploads native multipart without a hardcoded boundary and supports gap games", async () => {
  const post = jest
    .fn()
    .mockResolvedValue({
      data: { job_id: 4, session_id: "draft", status: "PENDING" },
    });
  const methods = createPhotoMatchMethods({ post } as unknown as AxiosInstance);
  await methods.uploadScoresheet(
    7,
    { uri: "file:///sheet.jpg", name: "sheet.jpg", type: "image/jpeg" },
    "read column 2",
    null,
  );
  expect(post).toHaveBeenCalledWith(
    "/api/leagues/7/matches/upload-photo",
    expect.any(FormData),
    { headers: { "Content-Type": undefined }, timeout: 60_000 },
  );
  await methods.confirmScoresheet(7, "draft", null, "2026-11-07", [
    { raw_name: "Sam", player_id: 13, player_name: "Samuel" },
  ]);
  expect(post).toHaveBeenLastCalledWith(
    "/api/leagues/7/matches/photo-sessions/draft/confirm",
    {
      season_id: null,
      match_date: "2026-11-07",
      player_overrides: [
        { raw_name: "Sam", player_id: 13, player_name: "Samuel" },
      ],
    },
    { timeout: 30_000 },
  );
});
