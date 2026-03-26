/**
 * Check whether an avatar value is an image URL (vs. initials text).
 *
 * @param {string|null} avatar - Avatar value from API
 * @returns {boolean} True if the value is a URL pointing to an image
 */
export function isImageUrl(avatar: string | null | undefined): boolean {
  if (!avatar) return false;
  return avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/');
}

/**
 * Get the display image URL for a player.
 *
 * Prefers profile_picture_url (an uploaded S3 image) over avatar (which may
 * be an initials string like "PS"). Returns null when neither field contains
 * an actual image URL.
 *
 * @param player - Object with optional avatar and profile_picture_url fields
 * @returns A URL string, or null if no image is available
 */
export function getPlayerImageUrl(
  player: { avatar?: string | null; profile_picture_url?: string | null },
): string | null {
  const url = player.profile_picture_url || player.avatar;
  return isImageUrl(url) ? url : null;
}
