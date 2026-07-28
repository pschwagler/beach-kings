import {
  formatCalendarDateLabel,
  formatLocalCalendarDate,
  parseCalendarDate,
} from '@/lib/calendarDate';

describe('calendarDate', () => {
  it('uses local calendar fields rather than the UTC ISO representation', () => {
    const dateAtLocalNight = {
      getFullYear: () => 2026,
      getMonth: () => 6,
      getDate: () => 16,
      toISOString: () => '2026-07-17T06:30:00.000Z',
    } as unknown as Date;

    expect(formatLocalCalendarDate(dateAtLocalNight)).toBe('2026-07-16');
  });

  it('formats the device-local day instead of the UTC day', () => {
    const instant = new Date('2026-07-17T06:30:00.000Z');

    expect(formatLocalCalendarDate(instant, 'America/Los_Angeles')).toBe(
      '2026-07-16',
    );
    expect(formatLocalCalendarDate(instant, 'Pacific/Auckland')).toBe(
      '2026-07-17',
    );
  });

  it('parses ISO and legacy US dates as local calendar dates', () => {
    const iso = parseCalendarDate('2026-03-19');
    const us = parseCalendarDate('3/19/2026');

    expect(iso).not.toBeNull();
    expect(us).not.toBeNull();
    expect(formatLocalCalendarDate(iso!)).toBe('2026-03-19');
    expect(formatLocalCalendarDate(us!)).toBe('2026-03-19');
    expect(iso?.getHours()).toBe(12);
  });

  it('rejects malformed and impossible calendar dates', () => {
    expect(parseCalendarDate('2026-02-29')).toBeNull();
    expect(parseCalendarDate('2026-13-01')).toBeNull();
    expect(parseCalendarDate('not-a-date')).toBeNull();
    expect(parseCalendarDate('2028-02-29')).not.toBeNull();
  });

  it('uses friendly labels for today, tomorrow, and later dates', () => {
    const today = new Date(2026, 6, 26, 12);

    expect(formatCalendarDateLabel('2026-07-26', today)).toBe(
      'Today, Jul 26, 2026',
    );
    expect(formatCalendarDateLabel('2026-07-27', today)).toBe(
      'Tomorrow, Jul 27, 2026',
    );
    expect(formatCalendarDateLabel('2026-07-29', today)).toBe(
      'Wed, Jul 29, 2026',
    );
    expect(formatCalendarDateLabel('', today)).toBe('Choose a date');
  });
});
