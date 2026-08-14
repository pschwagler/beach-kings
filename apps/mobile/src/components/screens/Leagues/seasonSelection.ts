interface SelectableSeason {
  readonly id: number;
  readonly is_active?: boolean | null;
}

/** Prefer the API's canonical active season, preserving newest-first fallback. */
export function defaultSeasonId(
  seasons: readonly SelectableSeason[],
): number | 'all' {
  return seasons.find((season) => season.is_active === true)?.id
    ?? seasons[0]?.id
    ?? 'all';
}
