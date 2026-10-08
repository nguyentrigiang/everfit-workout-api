import { isCalendarDate } from './calendar-date.js';

describe('isCalendarDate', () => {
  it('accepts a regular date', () => {
    expect(isCalendarDate('2026-10-07')).toBe(true);
  });

  it('accepts Feb 29 in a leap year and rejects it otherwise', () => {
    expect(isCalendarDate('2028-02-29')).toBe(true);
    expect(isCalendarDate('2026-02-29')).toBe(false);
  });

  it('rejects dates that do not exist', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false);
    expect(isCalendarDate('2026-13-01')).toBe(false);
  });

  it('rejects other formats', () => {
    expect(isCalendarDate('2026-10-07T00:00:00Z')).toBe(false);
    expect(isCalendarDate('07/10/2026')).toBe(false);
    expect(isCalendarDate('2026-1-7')).toBe(false);
  });
});
