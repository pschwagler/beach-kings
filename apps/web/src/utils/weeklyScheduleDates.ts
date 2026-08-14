/** Format a local calendar date for an HTML date input. */
export function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Default weekly schedules to roughly three months, ending on Sunday so the
 * generated sessions cover a complete Monday-Sunday week.
 */
export function getDefaultWeeklyScheduleEndDate(
  today = new Date(),
  maximumEndDate?: string | null,
): string {
  const targetMonth = new Date(today.getFullYear(), today.getMonth() + 3, 1);
  const lastDayOfTargetMonth = new Date(
    targetMonth.getFullYear(),
    targetMonth.getMonth() + 1,
    0,
  ).getDate();

  targetMonth.setDate(Math.min(today.getDate(), lastDayOfTargetMonth));
  targetMonth.setDate(targetMonth.getDate() + ((7 - targetMonth.getDay()) % 7));

  const defaultEndDate = formatDateInputValue(targetMonth);
  return maximumEndDate && maximumEndDate < defaultEndDate
    ? maximumEndDate
    : defaultEndDate;
}
