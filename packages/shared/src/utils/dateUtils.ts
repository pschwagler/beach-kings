/**
 * Date formatting utilities for the application
 */

/**
 * Format datetime with timezone information
 */
export function formatDateTimeWithTimezone(isoString: string | null | undefined, showYear = true): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeZoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  
  const dateStr = date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: showYear ? 'numeric' : undefined,
    timeZone 
  });
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone 
  });
  
  return `${dateStr} at ${timeStr} ${timeZoneName}`;
}

/**
 * Format date only (no time)
 */
export function formatDate(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return date.toLocaleDateString('en-US', { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric',
    timeZone 
  });
}

/**
 * Format time only (no date)
 */
export function formatTime(isoString: string | null | undefined): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeStr = date.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone 
  });
  const timeZoneName = new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(date).find(part => part.type === 'timeZoneName')?.value || '';
  return `${timeStr} ${timeZoneName}`;
}

/**
 * Convert UTC time string (HH:MM) to local time string
 */
export function utcTimeToLocal(utcTimeStr: string | null | undefined): string {
  if (!utcTimeStr) return utcTimeStr || '';
  const [hours, minutes] = utcTimeStr.split(':').map(Number);
  const today = new Date();
  const utcDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes));
  const localHours = String(utcDate.getHours()).padStart(2, '0');
  const localMinutes = String(utcDate.getMinutes()).padStart(2, '0');
  return `${localHours}:${localMinutes}`;
}

/**
 * Convert UTC time string (HH:MM) to local time string with timezone
 */
export function utcTimeToLocalWithTimezone(utcTimeStr: string | null | undefined): string {
  if (!utcTimeStr) return utcTimeStr || '';
  const [hours, minutes] = utcTimeStr.split(':').map(Number);
  const today = new Date();
  const utcDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hours, minutes));
  
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timeStr = utcDate.toLocaleTimeString('en-US', { 
    hour: 'numeric', 
    minute: '2-digit',
    timeZone 
  });
  const timeZoneName = Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(utcDate).find(part => part.type === 'timeZoneName')?.value || '';
  return `${timeStr} ${timeZoneName}`;
}

/**
 * Format a timestamp as a relative time string
 */
export function formatRelativeTime(timestamp: string | Date | null | undefined): string | null {
  if (!timestamp) return null;
  
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return null;
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    if (diffHours === 0) {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      if (diffMins < 1) return 'Just now';
      return `${diffMins} ${diffMins === 1 ? 'minute' : 'minutes'} ago`;
    }
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} ago`;
  } else {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
}
