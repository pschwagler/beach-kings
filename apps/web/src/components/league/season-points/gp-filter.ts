/** Inclusive season-game bounds. Empty fields mean no limit on that side. */
export function gpRange(minimum: string, maximum: string) {
  const min = minimum.trim() === "" ? 0 : Number(minimum);
  const max = maximum.trim() === "" ? Infinity : Number(maximum);
  if (
    !Number.isSafeInteger(min) ||
    min < 0 ||
    (maximum.trim() !== "" && (!Number.isSafeInteger(max) || max < 0))
  ) {
    return { min, max, error: "Use whole numbers of 0 or more." };
  }
  if (min > max)
    return { min, max, error: "Minimum GP must not exceed maximum GP." };
  return { min, max, error: null };
}
export function filterByGp<T extends { games: number }>(
  players: readonly T[],
  minimum: string,
  maximum: string,
): T[] {
  const { min, max, error } = gpRange(minimum, maximum);
  return error ? [] : players.filter((p) => p.games >= min && p.games <= max);
}
