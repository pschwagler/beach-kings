/**
 * Maps raw gender values to user-friendly display labels.
 * @param {string} gender - Raw gender value (e.g. "male", "female", "coed")
 * @returns {string} Display label (e.g. "Men's", "Women's", "Co-ed")
 */
export function formatGender(gender: string | null | undefined): string | null | undefined {
  const map: Record<string, string> = {
    male: "Men's",
    female: "Women's",
    mens: "Men's",
    womens: "Women's",
    coed: 'Co-ed',
  };
  return map[gender?.toLowerCase() ?? ''] || gender;
}
