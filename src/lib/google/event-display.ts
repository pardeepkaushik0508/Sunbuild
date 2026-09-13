/**
 * Pure helpers for Google Calendar ↔ SUNBUILD calendar mapping.
 * Kept free of server-only imports so unit tests can import them.
 */

export type GoogleListedEventLike = {
  googleEventId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  meetUrl?: string | null;
  calendarId?: string;
  calendarName?: string | null;
};

export type MappedCalendarEvent = {
  id: string;
  date: string;
  title: string;
  type: "google";
  meta: string;
  source: "google";
  googleEventId: string;
};

/**
 * Stable local calendar day key (YYYY-MM-DD).
 * - Plain date strings stay as-is
 * - Midnight-UTC ISO (typical Prisma date-only fields) use the UTC calendar day
 * - Everything else uses the viewer's local calendar day
 */
export function calendarDayKey(
  isoOrDate: string | Date,
  opts?: { allDay?: boolean }
): string {
  if (typeof isoOrDate === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
    if (opts?.allDay) return isoOrDate.slice(0, 10);
    // Date-only values often serialize as midnight UTC — keep that calendar day.
    if (/^\d{4}-\d{2}-\d{2}T00:00:00(\.0+)?(Z|[+-]00:00)$/.test(isoOrDate)) {
      return isoOrDate.slice(0, 10);
    }
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return "";
    return formatLocalDay(d);
  }
  if (Number.isNaN(isoOrDate.getTime())) return "";
  if (opts?.allDay) {
    return isoOrDate.toISOString().slice(0, 10);
  }
  // Local midnight Date from the grid — use local parts.
  if (
    isoOrDate.getHours() === 0 &&
    isoOrDate.getMinutes() === 0 &&
    isoOrDate.getSeconds() === 0 &&
    isoOrDate.getMilliseconds() === 0
  ) {
    return formatLocalDay(isoOrDate);
  }
  // Midnight UTC Date object (Prisma date-only) — use UTC calendar day.
  if (
    isoOrDate.getUTCHours() === 0 &&
    isoOrDate.getUTCMinutes() === 0 &&
    isoOrDate.getUTCSeconds() === 0 &&
    isoOrDate.getUTCMilliseconds() === 0
  ) {
    const y = isoOrDate.getUTCFullYear();
    const m = String(isoOrDate.getUTCMonth() + 1).padStart(2, "0");
    const day = String(isoOrDate.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  return formatLocalDay(isoOrDate);
}

function formatLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function googleMetaLabel(g: GoogleListedEventLike): string {
  const parts = ["Google Calendar"];
  if (g.calendarName && !/^primary$/i.test(g.calendarName)) {
    parts.push(g.calendarName);
  }
  if (g.meetUrl) parts.push("Meet");
  return parts.join(" · ");
}

/**
 * Map a Google Calendar API event into a SUNBUILD CalendarEvent.
 * Always labels the source as Google Calendar for the UI.
 */
export function mapGoogleEventToCalendarEvent(
  g: GoogleListedEventLike
): MappedCalendarEvent {
  const date = g.allDay
    ? g.start.toISOString().slice(0, 10)
    : g.start.toISOString();
  const calPart = g.calendarId
    ? g.calendarId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)
    : "cal";

  return {
    id: `google-${calPart}-${g.googleEventId}`,
    date,
    title: g.title,
    type: "google",
    meta: googleMetaLabel(g),
    source: "google",
    googleEventId: g.googleEventId,
  };
}

/** CRM / Sunbuild event label for the day list (not Google-sourced). */
export function crmEventMeta(existing?: string | null): string {
  if (existing && /google calendar/i.test(existing)) return existing;
  if (existing) return existing;
  return "CRM";
}
