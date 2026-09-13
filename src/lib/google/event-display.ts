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

/** Stable calendar day key. Prefer YYYY-MM-DD for all-day Google dates. */
export function calendarDayKey(
  isoOrDate: string | Date,
  opts?: { allDay?: boolean }
): string {
  if (typeof isoOrDate === "string") {
    // All-day Google dates often arrive as YYYY-MM-DD — keep as-is.
    if (/^\d{4}-\d{2}-\d{2}$/.test(isoOrDate)) return isoOrDate;
    const d = new Date(isoOrDate);
    if (Number.isNaN(d.getTime())) return "";
    if (opts?.allDay) return isoOrDate.slice(0, 10);
    // Local calendar day (avoids UTC shift for timed events in the UI).
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  if (Number.isNaN(isoOrDate.getTime())) return "";
  if (opts?.allDay) {
    return isoOrDate.toISOString().slice(0, 10);
  }
  const y = isoOrDate.getFullYear();
  const m = String(isoOrDate.getMonth() + 1).padStart(2, "0");
  const day = String(isoOrDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

  return {
    id: `google-${g.googleEventId}`,
    date,
    title: g.title,
    type: "google",
    meta: g.meetUrl ? "Google Calendar · Meet" : "Google Calendar",
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
