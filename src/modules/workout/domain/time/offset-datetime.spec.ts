import { parseOffsetDateTime } from './offset-datetime.js';

describe('parseOffsetDateTime', () => {
  it('parses a datetime with a positive offset', () => {
    expect(parseOffsetDateTime('2026-10-07T07:30:00+07:00')).toEqual({
      instant: new Date('2026-10-07T00:30:00Z'),
      localDate: '2026-10-07',
      utcOffsetMinutes: 420,
    });
  });

  it('parses a UTC datetime with Z and milliseconds', () => {
    expect(parseOffsetDateTime('2026-10-07T18:00:00.250Z')).toMatchObject({
      localDate: '2026-10-07',
      utcOffsetMinutes: 0,
    });
  });

  it('parses a negative offset', () => {
    expect(
      parseOffsetDateTime('2026-10-07T20:00-05:00')?.utcOffsetMinutes,
    ).toBe(-300);
  });

  it('keeps the local calendar day when the UTC instant is on the previous day', () => {
    // 6am on Nov 1 in Vietnam is still Oct 31 in UTC.
    const parsed = parseOffsetDateTime('2026-11-01T06:00:00+07:00');

    expect(parsed?.localDate).toBe('2026-11-01');
    expect(parsed?.instant.toISOString()).toBe('2026-10-31T23:00:00.000Z');
  });

  it('rejects a datetime without an offset', () => {
    expect(parseOffsetDateTime('2026-10-07T07:30:00')).toBeNull();
  });

  it('rejects a date only', () => {
    expect(parseOffsetDateTime('2026-10-07')).toBeNull();
  });

  it('rejects a date that does not exist', () => {
    expect(parseOffsetDateTime('2026-02-30T10:00:00Z')).toBeNull();
  });

  it('rejects an out-of-range offset', () => {
    expect(parseOffsetDateTime('2026-10-07T10:00:00+15:00')).toBeNull();
  });

  it('rejects an offset whose total exceeds 14 hours (+14:30)', () => {
    expect(parseOffsetDateTime('2026-10-07T10:00:00+14:30')).toBeNull();
  });

  it('accepts the extreme real offsets +14:00 and -12:00', () => {
    expect(
      parseOffsetDateTime('2026-10-07T10:00:00+14:00')?.utcOffsetMinutes,
    ).toBe(840);
    expect(
      parseOffsetDateTime('2026-10-07T10:00:00-12:00')?.utcOffsetMinutes,
    ).toBe(-720);
  });
});
