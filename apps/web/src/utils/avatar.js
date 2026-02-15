/**
 * Check whether an avatar value is an image URL (vs. initials text).
 *
 * @param {string|null} avatar - Avatar value from API
 * @returns {boolean} True if the value is a URL pointing to an image
 */
export function isImageUrl(avatar) {
  if (!avatar) return false;
  return avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/');
}
