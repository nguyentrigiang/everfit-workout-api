const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for an existing calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const match = CALENDAR_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}
