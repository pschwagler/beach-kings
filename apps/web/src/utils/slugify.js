/**
 * Convert a string to a URL-safe slug.
 * @param {string} text - Text to slugify (e.g. "John Doe")
 * @returns {string} Slugified text (e.g. "john-doe")
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}
