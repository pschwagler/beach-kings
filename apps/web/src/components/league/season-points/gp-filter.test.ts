import assert from "node:assert/strict";
import { test } from "vitest";
import { filterByGp, gpRange } from "./gp-filter";
const players = Object.freeze([
  { games: 0 },
  { games: 4 },
  { games: 8 },
  { games: 20 },
  { games: 48 },
]);
test("blank, minimum-only, maximum-only and exact GP ranges use inclusive bounds", () => {
  assert.deepEqual(filterByGp(players, "", ""), players);
  assert.deepEqual(
    filterByGp(players, "8", "").map((p) => p.games),
    [8, 20, 48],
  );
  assert.deepEqual(
    filterByGp(players, "", "8").map((p) => p.games),
    [0, 4, 8],
  );
  assert.deepEqual(
    filterByGp(players, "4", "20").map((p) => p.games),
    [4, 8, 20],
  );
  assert.deepEqual(
    filterByGp(players, "8", "8").map((p) => p.games),
    [8],
  );
  assert.deepEqual(
    filterByGp(players, "0", "0").map((p) => p.games),
    [0],
  );
  assert.deepEqual(filterByGp(players, "49", ""), []);
});
test("reversed, fractional, negative and invalid ranges report errors", () => {
  for (const [min, max] of [
    ["20", "8"],
    ["-1", ""],
    ["", "-1"],
    ["1.5", ""],
    ["", "2.5"],
    ["no", ""],
    ["", "no"],
    ["", "1e999"],
    ["1e999", ""],
  ]) {
    assert.ok(gpRange(min, max).error);
    assert.deepEqual(filterByGp(players, min, max), []);
  }
});
