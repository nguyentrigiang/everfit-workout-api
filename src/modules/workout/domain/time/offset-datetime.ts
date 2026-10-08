export interface OffsetDateTime {
  /** The moment in time (stored as UTC). */
  instant: Date;
  /** Calendar day in the client's local time, `YYYY-MM-DD`. */
  localDate: string;
  utcOffsetMinutes: number;
}

// ISO 8601 datetime with a mandatory offset: 2026-10-07T07:30[:00[.123]](Z|+07:00)
const OFFSET_DATETIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/;

/**
 * Parses an ISO datetime that carries its UTC offset. Returns null when the offset is
 * missing or the date/time does not exist (e.g. 2026-02-30). The local calendar day is
 * the date part as written, because the string is already in the client's local time.
 */
export function parseOffsetDateTime(value: string): OffsetDateTime | null {
  const match = OFFSET_DATETIME.exec(value);
  if (!match) return null;

  const [, y, mo, d, h, mi, s = '0', zone, sign, oh, om] = match;
  const offsetMinutes =
    zone === 'Z' ? 0 : (sign === '-' ? -1 : 1) * (Number(oh) * 60 + Number(om));
  // Real offsets are within ±14:00 (same bound as the DB CHECK constraint).
  if (Number(om ?? 0) > 59 || Math.abs(offsetMinutes) > 14 * 60) return null;

  // Reject impossible calendar values that Date would silently roll over.
  const local = new Date(
    Date.UTC(
      Number(y),
      Number(mo) - 1,
      Number(d),
      Number(h),
      Number(mi),
      Number(s),
    ),
  );
  if (
    local.getUTCFullYear() !== Number(y) ||
    local.getUTCMonth() !== Number(mo) - 1 ||
    local.getUTCDate() !== Number(d) ||
    local.getUTCHours() !== Number(h) ||
    local.getUTCMinutes() !== Number(mi)
  ) {
    return null;
  }

  return {
    instant: new Date(value),
    localDate: `${y}-${mo}-${d}`,
    utcOffsetMinutes: offsetMinutes,
  };
}
