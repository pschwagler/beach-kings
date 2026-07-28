const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const US_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Format a Date as a date-only value in the device's local calendar.
 *
 * This deliberately avoids `toISOString()`, which converts to UTC before
 * extracting the date and can therefore return tomorrow or yesterday.
 */
export function formatLocalCalendarDate(
  date: Date = new Date(),
  timeZone?: string,
): string {
  if (timeZone != null) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const valueFor = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((part) => part.type === type)?.value ?? '';
    return [
      valueFor('year'),
      valueFor('month'),
      valueFor('day'),
    ].join('-');
  }

  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
  ].join('-');
}

/** Parse supported backend date-only shapes into a local-noon Date. */
export function parseCalendarDate(value: string): Date | null {
  const iso = ISO_DATE_PATTERN.exec(value);
  const us = US_DATE_PATTERN.exec(value);
  const parts =
    iso != null
      ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
      : us != null
        ? { year: Number(us[3]), month: Number(us[1]), day: Number(us[2]) }
        : null;
  if (parts == null) return null;

  // Noon is intentionally stable across daylight-saving transitions and
  // native date-picker timezone conversions.
  const date = new Date(parts.year, parts.month - 1, parts.day, 12);
  if (
    date.getFullYear() !== parts.year ||
    date.getMonth() !== parts.month - 1 ||
    date.getDate() !== parts.day
  ) {
    return null;
  }
  return date;
}

/** Friendly, unambiguous label for the session date field. */
export function formatCalendarDateLabel(
  value: string,
  today: Date = new Date(),
): string {
  const date = parseCalendarDate(value);
  if (date == null) return 'Choose a date';

  const selectedKey = formatLocalCalendarDate(date);
  const todayKey = formatLocalCalendarDate(today);
  const tomorrow = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + 1,
    12,
  );
  const prefix =
    selectedKey === todayKey
      ? 'Today'
      : selectedKey === formatLocalCalendarDate(tomorrow)
        ? 'Tomorrow'
        : date.toLocaleDateString('en-US', { weekday: 'short' });
  const calendarLabel = date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${prefix}, ${calendarLabel}`;
}
