import { describe, expect, it } from 'vitest';
import { getDefaultWeeklyScheduleEndDate } from '../weeklyScheduleDates';

describe('getDefaultWeeklyScheduleEndDate', () => {
  it('defaults to the Sunday at the end of the week three months from today', () => {
    expect(getDefaultWeeklyScheduleEndDate(new Date(2026, 7, 14))).toBe('2026-11-15');
  });

  it('clamps calendar-month rollover before finding the end of the week', () => {
    expect(getDefaultWeeklyScheduleEndDate(new Date(2026, 0, 31))).toBe('2026-05-03');
  });

  it('does not default beyond the selected season', () => {
    expect(getDefaultWeeklyScheduleEndDate(new Date(2026, 7, 14), '2026-10-31')).toBe('2026-10-31');
  });
});
