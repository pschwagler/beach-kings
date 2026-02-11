/**
 * Utilities for formatting division labels (gender + level) for display.
 */

/**
 * Format gender and level as a display label, e.g. "Mens Open" or "Womens Advanced".
 * @param {string} [gender] - e.g. 'male', 'female'
 * @param {string} [level] - e.g. 'open', 'advanced', 'beginner'
 * @returns {string|null} - Combined label or null if both missing
 */
export function formatDivisionLabel(gender, level) {
  const g = (gender || '').toLowerCase();
  const l = (level || '').trim();
  const genderLabel = g === 'male' ? 'Mens' : g === 'female' ? 'Womens' : null;
  const levelLabel = l ? l.charAt(0).toUpperCase() + l.slice(1).toLowerCase() : null;
  if (genderLabel && levelLabel) return `${genderLabel} ${levelLabel}`;
  if (genderLabel) return genderLabel;
  if (levelLabel) return levelLabel;
  return null;
}
