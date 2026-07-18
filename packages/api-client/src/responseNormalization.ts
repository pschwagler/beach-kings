/** Extract a canonical array from a current envelope or a legacy bare array. */
export function normalizeItems<T>(
  response: { readonly items?: T[] } | T[] | null | undefined,
): T[] {
  if (response == null) return [];
  return Array.isArray(response) ? response : (response.items ?? []);
}
