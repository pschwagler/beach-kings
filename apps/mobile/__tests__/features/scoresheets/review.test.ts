import {
  resolveScoresheetMatches,
  scoresheetReviewIssue,
} from "@/features/scoresheets/review";
import type { ScoresheetMatch } from "@beach-kings/api-client";

const match: ScoresheetMatch = {
  number: 1,
  scores: [21, 19],
  players: [1, 2, 3, 4].map((id) => ({
    id,
    name: `Player ${id}`,
    rawName: `Player ${id}`,
  })),
};
test("requires four distinct resolved players and complete untied scores", () => {
  expect(scoresheetReviewIssue([match])).toBeNull();
  expect(scoresheetReviewIssue([])).toContain("No games");
  for (const scores of [
    [null, 21],
    [0, 0],
    [21, 21],
    [-1, 21],
    [1.5, 21],
  ] as const) {
    expect(scoresheetReviewIssue([{ ...match, scores }])).toContain("scores");
  }
  expect(
    scoresheetReviewIssue([
      { ...match, players: [match.players[0]!, ...match.players.slice(0, 3)] },
    ]),
  ).toContain("more than once");
});
test("applies case-insensitive resolutions across games without altering parser data or matched players", () => {
  const unknown = { id: null, name: "Sam", rawName: "Sam" };
  const games = [{ ...match, players: [unknown, ...match.players.slice(1)] }];
  expect(scoresheetReviewIssue(games)).toContain("unrecognized");
  const resolved = resolveScoresheetMatches(games, [
    { raw_name: "sam", player_id: 8, player_name: "Samuel" },
  ]);
  expect(resolved[0]?.players[0]?.name).toBe("Samuel");
  expect(scoresheetReviewIssue(resolved)).toBeNull();
  expect(games[0]?.players[0]?.id).toBeNull();
  expect(
    resolveScoresheetMatches(
      [match],
      [{ raw_name: "Player 1", player_id: 99, player_name: "Other" }],
    )[0]?.players[0]?.id,
  ).toBe(1);
});
