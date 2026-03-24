/**
 * Maps raw gender values to user-friendly display labels.
 * @param {string} gender - Raw gender value (e.g. "male", "female", "coed")
 * @returns {string} Display label (e.g. "Men's", "Women's", "Co-ed")
 */
export function formatGender(gender) {
  const map = { male: "Men's", female: "Women's", coed: 'Co-ed' };
  return map[gender?.toLowerCase()] || gender;
}
