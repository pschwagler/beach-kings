import { parseCalendarDate } from '@/lib/calendarDate';

export function formatLastGameLabel(value: string | null | undefined): string {
  const date = value ? parseCalendarDate(value) : null;
  if (date == null) return 'No games yet';

  return `Last game ${date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`;
}
