import "server-only";

import { calendar, type calendar_v3 } from "@googleapis/calendar";
import { prisma } from "@/lib/db";
import {
  getAuthedGoogleClient,
  markGoogleReconnectRequired,
} from "@/lib/google/auth-client";
import {
  getGoogleCache,
  getGoogleErrorCacheTtlMs,
  googleEventsCacheKey,
  invalidateGoogleCacheForUser,
  setGoogleCache,
} from "@/lib/google/cache";
import {
  classifyGoogleError,
  googleErrorLogFields,
} from "@/lib/google/errors";
import type { ListedGoogleEvent } from "@/lib/google/listed-event";

export {
  buildGoogleAuthUrl,
  disconnectGoogleCalendar,
  exchangeCodeForTokens,
  getGoogleAccountEmail,
  getPublicConnection,
  saveGoogleConnection,
} from "@/lib/google/auth-client";
export type { PublicGoogleConnection } from "@/lib/google/types";
export type { ListedGoogleEvent } from "@/lib/google/listed-event";

/**
 * Returns an authenticated Google Calendar API client for the user.
 * Refreshes access tokens automatically. Marks reconnect when refresh fails.
 */
export async function getAuthedCalendarClient(
  userId: string,
  companyId: string
): Promise<{
  calendar: calendar_v3.Calendar;
  /** Shared OAuth2 client — reuse for Tasks / other Google APIs. */
  auth: NonNullable<Awaited<ReturnType<typeof getAuthedGoogleClient>>>["auth"];
  connectionId: string;
  calendarId: string;
  scope: string | null;
} | null> {
  const authed = await getAuthedGoogleClient(userId, companyId);
  if (!authed) return null;

  return {
    calendar: calendar({ version: "v3", auth: authed.auth }),
    auth: authed.auth,
    connectionId: authed.connectionId,
    calendarId: authed.calendarId,
    scope: authed.scope,
  };
}

export type GoogleCalendarEventInput = {
  summary: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  allDay?: boolean;
  createMeet?: boolean;
};

function toGoogleDate(
  date: Date,
  allDay: boolean | undefined,
  timeZone: string
): calendar_v3.Schema$EventDateTime {
  if (allDay) {
    return { date: date.toISOString().slice(0, 10) };
  }
  return { dateTime: date.toISOString(), timeZone };
}

export async function createGoogleEvent(
  userId: string,
  companyId: string,
  input: GoogleCalendarEventInput
): Promise<{
  googleEventId: string;
  googleCalendarId: string;
  googleMeetUrl: string | null;
} | null> {
  const authed = await getAuthedCalendarClient(userId, companyId);
  if (!authed) return null;

  const timeZone =
    input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const body: calendar_v3.Schema$Event = {
    summary: input.summary,
    description: input.description || undefined,
    location: input.location || undefined,
    start: toGoogleDate(input.start, input.allDay, timeZone),
    end: toGoogleDate(input.end, input.allDay, timeZone),
    attendees: input.attendees?.map((a) => ({
      email: a.email,
      displayName: a.displayName,
    })),
  };

  if (input.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `sb-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  try {
    const res = await authed.calendar.events.insert({
      calendarId: authed.calendarId,
      requestBody: body,
      conferenceDataVersion: input.createMeet ? 1 : 0,
      sendUpdates: input.attendees?.length ? "all" : "none",
    });
    const id = res.data.id;
    if (!id) return null;
    const meet =
      res.data.hangoutLink ||
      res.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ||
      null;
    invalidateGoogleCacheForUser(userId);
    return {
      googleEventId: id,
      googleCalendarId: authed.calendarId,
      googleMeetUrl: meet,
    };
  } catch (err) {
    const classified = classifyGoogleError(err, "calendar");
    console.error("[google-calendar] create event failed:", {
      userId,
      companyId,
      ...googleErrorLogFields(err, classified),
    });
    if (classified.requiresReconnect) {
      await markGoogleReconnectRequired(authed.connectionId);
      invalidateGoogleCacheForUser(userId);
    }
    throw err;
  }
}

export async function updateGoogleEvent(
  userId: string,
  companyId: string,
  googleEventId: string,
  input: Partial<GoogleCalendarEventInput> & { googleCalendarId?: string }
): Promise<{ googleMeetUrl: string | null } | null> {
  const authed = await getAuthedCalendarClient(userId, companyId);
  if (!authed) return null;

  const calendarId = input.googleCalendarId || authed.calendarId;
  const timeZone =
    input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

  const body: calendar_v3.Schema$Event = {};
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.description !== undefined)
    body.description = input.description || undefined;
  if (input.location !== undefined) body.location = input.location || undefined;
  if (input.start)
    body.start = toGoogleDate(input.start, input.allDay, timeZone);
  if (input.end) body.end = toGoogleDate(input.end, input.allDay, timeZone);
  if (input.attendees) {
    body.attendees = input.attendees.map((a) => ({
      email: a.email,
      displayName: a.displayName,
    }));
  }
  if (input.createMeet) {
    body.conferenceData = {
      createRequest: {
        requestId: `sb-upd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  try {
    const res = await authed.calendar.events.patch({
      calendarId,
      eventId: googleEventId,
      requestBody: body,
      conferenceDataVersion: input.createMeet ? 1 : 0,
      sendUpdates: input.attendees?.length ? "all" : "none",
    });
    const meet =
      res.data.hangoutLink ||
      res.data.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ||
      null;
    invalidateGoogleCacheForUser(userId);
    return { googleMeetUrl: meet };
  } catch (err) {
    const classified = classifyGoogleError(err, "calendar");
    console.error("[google-calendar] update event failed:", {
      userId,
      companyId,
      ...googleErrorLogFields(err, classified),
    });
    if (classified.requiresReconnect) {
      await markGoogleReconnectRequired(authed.connectionId);
      invalidateGoogleCacheForUser(userId);
    }
    throw err;
  }
}

export async function deleteGoogleEvent(
  userId: string,
  companyId: string,
  googleEventId: string,
  googleCalendarId?: string
): Promise<boolean> {
  const authed = await getAuthedCalendarClient(userId, companyId);
  if (!authed) return false;
  try {
    await authed.calendar.events.delete({
      calendarId: googleCalendarId || authed.calendarId,
      eventId: googleEventId,
      sendUpdates: "all",
    });
    invalidateGoogleCacheForUser(userId);
    return true;
  } catch (err) {
    const status = (err as { code?: number })?.code;
    if (status === 404 || status === 410) return true;
    const classified = classifyGoogleError(err, "calendar");
    console.error("[google-calendar] delete event failed:", {
      userId,
      companyId,
      ...googleErrorLogFields(err, classified),
    });
    if (classified.requiresReconnect) {
      await markGoogleReconnectRequired(authed.connectionId);
      invalidateGoogleCacheForUser(userId);
    }
    return false;
  }
}

function parseGoogleEventItem(
  item: calendar_v3.Schema$Event,
  calendarId: string,
  calendarName: string | null
): ListedGoogleEvent | null {
  if (!item.id || item.status === "cancelled") return null;
  const startRaw = item.start?.dateTime || item.start?.date;
  const endRaw = item.end?.dateTime || item.end?.date;
  if (!startRaw) return null;
  const allDay = Boolean(item.start?.date && !item.start?.dateTime);
  const start = allDay
    ? new Date(`${startRaw.slice(0, 10)}T12:00:00.000Z`)
    : new Date(startRaw);
  const end = endRaw
    ? allDay
      ? new Date(`${endRaw.slice(0, 10)}T12:00:00.000Z`)
      : new Date(endRaw)
    : start;
  return {
    googleEventId: item.id,
    title: item.summary || "(No title)",
    start,
    end,
    allDay,
    location: item.location ?? null,
    meetUrl:
      item.hangoutLink ||
      item.conferenceData?.entryPoints?.find(
        (e) => e.entryPointType === "video"
      )?.uri ||
      null,
    description: null,
    calendarId,
    calendarName,
  };
}

/**
 * Pull events from every Google calendar the user has selected
 * (primary, Birthdays, Holidays in India, Tasks, Family, etc.).
 */
export async function listGoogleEventsInRange(
  userId: string,
  companyId: string,
  timeMin: Date,
  timeMax: Date,
  opts?: { force?: boolean }
): Promise<{
  events: ListedGoogleEvent[];
  reconnectRequired: boolean;
  error: boolean;
}> {
  const cacheKey = googleEventsCacheKey(
    userId,
    companyId,
    timeMin.toISOString(),
    timeMax.toISOString()
  );
  if (!opts?.force) {
    const cached = getGoogleCache<{
      events: ListedGoogleEvent[];
      reconnectRequired: boolean;
      error: boolean;
    }>(cacheKey);
    if (cached) return cached;
  } else {
    invalidateGoogleCacheForUser(userId);
  }

  const authed = await getAuthedCalendarClient(userId, companyId);
  if (!authed) {
    const row = await prisma.googleCalendarConnection.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { status: true },
    });
    // CONNECTED-but-unusable (expired/decrypt) must surface as reconnect,
    // otherwise the UI shows "Connected" with an empty calendar forever.
    if (
      row?.status === "RECONNECT_REQUIRED" ||
      row?.status === "CONNECTED"
    ) {
      return { events: [], reconnectRequired: true, error: true };
    }
    return {
      events: [],
      reconnectRequired: false,
      error: false,
    };
  }

  try {
    const calendarTargets: Array<{ id: string; name: string | null }> = [];

    try {
      const listRes = await authed.calendar.calendarList.list({
        maxResults: 250,
        showHidden: false,
        showDeleted: false,
      });
      for (const cal of listRes.data.items ?? []) {
        if (!cal.id) continue;
        // Only calendars the user has toggled on in Google Calendar UI
        if (cal.selected === false) continue;
        calendarTargets.push({
          id: cal.id,
          name: cal.summaryOverride || cal.summary || null,
        });
      }
    } catch (listErr) {
      console.error("[google-calendar] calendarList failed; using fallbacks:", {
        message: listErr instanceof Error ? listErr.message : "unknown",
      });
    }

    if (calendarTargets.length === 0) {
      calendarTargets.push(
        { id: authed.calendarId || "primary", name: "Primary" },
        // Common Google system calendars (best-effort)
        { id: "#contacts@group.v.calendar.google.com", name: "Birthdays" },
        {
          id: "en.indian#holiday@group.v.calendar.google.com",
          name: "Holidays in India",
        },
        {
          id: "en.usa#holiday@group.v.calendar.google.com",
          name: "Holidays in United States",
        }
      );
    }

    const events: ListedGoogleEvent[] = [];
    const seen = new Set<string>();

    await Promise.all(
      calendarTargets.map(async (cal) => {
        try {
          const res = await authed.calendar.events.list({
            calendarId: cal.id,
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            singleEvents: true,
            orderBy: "startTime",
            maxResults: 250,
          });
          for (const item of res.data.items ?? []) {
            const parsed = parseGoogleEventItem(item, cal.id, cal.name);
            if (!parsed) continue;
            const key = `${cal.id}:${parsed.googleEventId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            events.push(parsed);
          }
        } catch (calErr) {
          // Skip calendars the token can't read (e.g. holiday calendars without access)
          const status = (calErr as { code?: number })?.code;
          if (status === 401 || status === 403) {
            // Don't mark reconnect for a single secondary calendar failure
            if (cal.id === "primary" || cal.id === authed.calendarId) {
              throw calErr;
            }
          }
        }
      })
    );

    events.sort((a, b) => a.start.getTime() - b.start.getTime());
    const result = { events, reconnectRequired: false, error: false };
    setGoogleCache(cacheKey, result, 45_000);
    return result;
  } catch (err) {
    const classified = classifyGoogleError(err, "calendar");
    console.error("[google-calendar] list events failed:", {
      userId,
      companyId,
      ...googleErrorLogFields(err, classified),
    });
    if (classified.requiresReconnect) {
      await markGoogleReconnectRequired(authed.connectionId);
      invalidateGoogleCacheForUser(userId);
      const result = { events: [], reconnectRequired: true, error: true };
      setGoogleCache(cacheKey, result, getGoogleErrorCacheTtlMs());
      return result;
    }
    const result = { events: [], reconnectRequired: false, error: true };
    setGoogleCache(cacheKey, result, getGoogleErrorCacheTtlMs());
    return result;
  }
}
