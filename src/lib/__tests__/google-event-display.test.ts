/**
 * Unit tests for Google Calendar event display mapping.
 * Run: npx tsx --test src/lib/__tests__/google-event-display.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calendarDayKey,
  crmEventMeta,
  mapGoogleEventToCalendarEvent,
} from "../google/event-display";

describe("google event-display", () => {
  it("maps Google events with Google Calendar label", () => {
    const mapped = mapGoogleEventToCalendarEvent({
      googleEventId: "abc123",
      title: "Meeting With 908 Pardeep",
      start: new Date("2026-09-14T10:00:00.000Z"),
      end: new Date("2026-09-14T11:00:00.000Z"),
      allDay: false,
      meetUrl: null,
    });
    assert.equal(mapped.source, "google");
    assert.equal(mapped.type, "google");
    assert.equal(mapped.meta, "Google Calendar");
    assert.equal(mapped.id, "google-abc123");
    assert.equal(mapped.googleEventId, "abc123");
  });

  it("labels Meet events from Google", () => {
    const mapped = mapGoogleEventToCalendarEvent({
      googleEventId: "meet1",
      title: "Site Visit",
      start: new Date("2026-09-14T05:30:00.000Z"),
      end: new Date("2026-09-14T06:30:00.000Z"),
      allDay: false,
      meetUrl: "https://meet.google.com/xyz",
    });
    assert.match(mapped.meta, /Google Calendar/);
    assert.match(mapped.meta, /Meet/);
  });

  it("keeps all-day Google dates as YYYY-MM-DD", () => {
    const mapped = mapGoogleEventToCalendarEvent({
      googleEventId: "holiday",
      title: "Ganesh Chaturthi",
      start: new Date("2026-09-14T12:00:00.000Z"),
      end: new Date("2026-09-15T12:00:00.000Z"),
      allDay: true,
    });
    assert.equal(mapped.date, "2026-09-14");
    assert.equal(calendarDayKey(mapped.date, { allDay: true }), "2026-09-14");
  });

  it("labels CRM events distinctly from Google", () => {
    assert.equal(crmEventMeta(undefined), "CRM");
    assert.equal(crmEventMeta("Project Alpha"), "Project Alpha");
    assert.equal(crmEventMeta("Google Calendar"), "Google Calendar");
  });

  it("calendarDayKey uses local day for Date objects", () => {
    const d = new Date(2026, 8, 14, 15, 0, 0); // Sep 14 local
    assert.equal(calendarDayKey(d), "2026-09-14");
  });
});
