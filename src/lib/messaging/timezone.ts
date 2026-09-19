/**
 * Business timezone helpers for due-today / due-in-3-days reminders.
 * Uses the company/product timezone — never the server's UTC midnight.
 */

export const DEFAULT_BUSINESS_TIMEZONE = "America/Edmonton";

export function getBusinessTimeZone(override?: string | null): string {
  const fromEnv = process.env.BUSINESS_TIMEZONE?.trim();
  return override?.trim() || fromEnv || DEFAULT_BUSINESS_TIMEZONE;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Calendar YYYY-MM-DD in the given IANA timezone. */
export function zonedYmd(date: Date, timeZone = getBusinessTimeZone()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  if (!year || !month || !day) {
    return date.toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

export function addCalendarDays(ymd: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) return ymd;
  const utc = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const next = new Date(utc + days * 24 * 60 * 60 * 1000);
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(
    next.getUTCDate()
  )}`;
}

/** Stored due dates are treated as calendar dates (UTC date portion). */
export function calendarDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function isCalendarDateToday(
  value: Date | string | null | undefined,
  now = new Date(),
  timeZone = getBusinessTimeZone()
): boolean {
  const due = calendarDateKey(value);
  return Boolean(due && due === zonedYmd(now, timeZone));
}

export function isCalendarDateInExactlyDays(
  value: Date | string | null | undefined,
  days: number,
  now = new Date(),
  timeZone = getBusinessTimeZone()
): boolean {
  const due = calendarDateKey(value);
  if (!due) return false;
  return due === addCalendarDays(zonedYmd(now, timeZone), days);
}

export function isCalendarDateBeforeToday(
  value: Date | string | null | undefined,
  now = new Date(),
  timeZone = getBusinessTimeZone()
): boolean {
  const due = calendarDateKey(value);
  if (!due) return false;
  return due < zonedYmd(now, timeZone);
}
