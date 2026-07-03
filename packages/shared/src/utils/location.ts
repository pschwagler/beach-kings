/**
 * Location display formatting.
 *
 * The players `city` column is not always a clean city name: signup/location
 * autocomplete has stored fully-formatted values like "City, State" — and in
 * at least one row a doubled "Greenpoint, New York, New York" — directly into
 * `city`. Naively rendering `` `${city}, ${state}` `` then produces a doubled
 * state name, and rendering it when both fields are empty produces a bare ", ".
 *
 * `formatLocation` is the single source of truth for turning a (city, state)
 * pair into a clean, display-ready label (or null when there is nothing to
 * show), so both the profile header and the court detail screen stay
 * consistent and defensive against the dirty data.
 */

/**
 * Split a raw location string on commas into trimmed, non-empty segments,
 * deduplicating case-insensitively while preserving first-occurrence order.
 * "Greenpoint, New York, New York" -> ["Greenpoint", "New York"].
 */
function dedupeSegments(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const segment = part.trim();
    if (segment.length === 0) continue;
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(segment);
  }
  return out;
}

/**
 * Format a `city` / `state` pair into a display-ready "City, State" label.
 *
 * Rules, in order:
 *   - Both empty (after trimming) -> `null` so the caller can omit the line
 *     entirely rather than render a bare ", ".
 *   - Only one present -> that value alone.
 *   - `city` already contains region info (multiple comma-separated parts) ->
 *     the deduped city is returned as-is and `state` is dropped as redundant,
 *     since the dirty `city` column already bakes it in.
 *   - Bare single-segment city that equals `state` (case-insensitive) -> the
 *     city alone (avoids "New York, New York").
 *   - Otherwise -> "City, State".
 *
 * @param city - Raw city value (may be dirty, null, or undefined).
 * @param state - Raw state value (may be null or undefined).
 * @returns A clean location label, or null when there is nothing to display.
 */
export function formatLocation(
  city: string | null | undefined,
  state: string | null | undefined,
): string | null {
  const rawCity = (city ?? '').trim();
  const rawState = (state ?? '').trim();

  const citySegments = dedupeSegments(rawCity);
  const cleanCity = citySegments.join(', ');

  if (cleanCity.length === 0) {
    return rawState.length > 0 ? rawState : null;
  }
  if (rawState.length === 0) {
    return cleanCity;
  }
  // City already carries region info — don't append the (redundant) state.
  if (citySegments.length > 1) {
    return cleanCity;
  }
  // Bare city that is itself the state — avoid "New York, New York".
  if (cleanCity.toLowerCase() === rawState.toLowerCase()) {
    return cleanCity;
  }
  return `${cleanCity}, ${rawState}`;
}

/**
 * Extract a clean, bare city name for STORAGE — the inverse of
 * {@link formatLocation}, which is for display.
 *
 * The `state` is persisted in its own column, so `city` must never carry it.
 * This strips a trailing state segment already baked into `city` (the exact
 * bug that corrupted the players table) and dedupes repeats, so dirty values
 * self-heal the next time a profile is saved:
 *   - "San Diego, California" + "California" -> "San Diego"
 *   - "Greenpoint, New York, New York" + "New York" -> "Greenpoint"
 *
 * It only strips a trailing segment that case-insensitively equals the state,
 * and never strips the final remaining segment. When the trailing part differs
 * from `state` (e.g. an abbreviation mismatch, "Brooklyn, New York" + "NY") the
 * value is left intact — still stable, since it can no longer grow on save.
 *
 * @param city - Raw city value (may be dirty, null, or undefined).
 * @param state - Raw state value (may be null or undefined).
 * @returns The bare city name, or an empty string when there is nothing to store.
 */
export function cleanCityName(
  city: string | null | undefined,
  state: string | null | undefined,
): string {
  const segments = dedupeSegments((city ?? '').trim());
  if (segments.length === 0) return '';

  const stateKey = (state ?? '').trim().toLowerCase();
  while (
    segments.length > 1 &&
    segments[segments.length - 1].toLowerCase() === stateKey
  ) {
    segments.pop();
  }
  return segments.join(', ');
}
