/**
 * Shared utilities for admin tab components.
 */

/**
 * Format an ISO date string to a human-readable locale string.
 *
 * @param {string|null} dateString - ISO date string
 * @returns {string} Formatted date or 'N/A'
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateString;
  }
}
