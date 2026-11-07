import type {
  PhotoPlayerOverride,
  ScoresheetMatch,
} from "@beach-kings/api-client";

export function resolveScoresheetMatches(
  matches: readonly ScoresheetMatch[],
  overrides: readonly PhotoPlayerOverride[],
): readonly ScoresheetMatch[] {
  return matches.map((match) => ({
    ...match,
    players: match.players.map((player) => {
      const override = overrides.find(
        (item) => item.raw_name.toLowerCase() === player.rawName.toLowerCase(),
      );
      return player.id != null || override == null
        ? player
        : { ...player, id: override.player_id, name: override.player_name };
    }),
  }));
}

export function scoresheetReviewIssue(
  matches: readonly ScoresheetMatch[],
): string | null {
  if (matches.length === 0)
    return "No games found. Try a clearer photo or describe the scores below.";
  for (const match of matches) {
    if (
      match.players.length !== 4 ||
      match.players.some((player) => player.id == null)
    ) {
      return "Match each unrecognized name to a player before adding games.";
    }
    if (new Set(match.players.map((player) => player.id)).size !== 4) {
      return `Game ${match.number} has a player more than once. Request a correction below.`;
    }
    const [a, b] = match.scores;
    if (
      a == null ||
      b == null ||
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      b < 0 ||
      a === b
    ) {
      return `Check the scores for game ${match.number}. Request a correction below.`;
    }
  }
  return null;
}
