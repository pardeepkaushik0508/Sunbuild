import "server-only";

import { google, type calendar_v3 } from "googleapis";
import { prisma } from "@/lib/db";
import {
  getGoogleOAuthConfig,
  GOOGLE_CALENDAR_SCOPES,
  type GoogleConnectionStatus,
} from "@/lib/google/config";
import type { PublicGoogleConnection } from "@/lib/google/types";
import { decryptSecret, encryptSecret } from "@/lib/google/crypto";
import {
  getGoogleCache,
  googleEventsCacheKey,
  invalidateGoogleCacheForUser,
  setGoogleCache,
} from "@/lib/google/cache";
import { AppError } from "@/lib/errors";

export type { PublicGoogleConnection } from "@/lib/google/types";

function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildGoogleAuthUrl(state: string): string {
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GOOGLE_CALENDAR_SCOPES],
    state,
    include_granted_scopes: true,
  });
}

export async function exchangeCodeForTokens(code: string) {
  const client = createOAuth2Client();
  const { tokens } = await client.getToken(code);
  if (!tokens.access_token) {
    throw new AppError(
      "Could not connect Google Calendar",
      400,
      "GOOGLE_TOKEN"
    );
  }
  return tokens;
}

export async function getGoogleAccountEmail(
  accessToken: string
): Promise<string | null> {
  try {
    const client = createOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    const oauth2 = google.oauth2({ version: "v2", auth: client });
    const me = await oauth2.userinfo.get();
    return me.data.email ?? null;
  } catch {
    return null;
  }
}

export async function getPublicConnection(
  userId: string,
  companyId: string
): Promise<PublicGoogleConnection> {
  const configured = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
  const row = await prisma.googleCalendarConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      status: true,
      googleAccountEmail: true,
      refreshTokenEncrypted: true,
    },
  });
  if (!row || row.status === "DISCONNECTED") {
    return {
      connected: false,
      status: "NOT_CONNECTED",
      email: null,
      configured,
    };
  }
  return {
    connected: row.status === "CONNECTED",
    status: row.status as GoogleConnectionStatus,
    email: row.googleAccountEmail,
    configured,
  };
}

export async function saveGoogleConnection(input: {
  userId: string;
  companyId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number | null;
  scope?: string | null;
  email?: string | null;
}) {
  const accessTokenEncrypted = await encryptSecret(input.accessToken);
  const existing = await prisma.googleCalendarConnection.findUnique({
    where: {
      userId_companyId: {
        userId: input.userId,
        companyId: input.companyId,
      },
    },
    select: { id: true, refreshTokenEncrypted: true },
  });

  let refreshTokenEncrypted = existing?.refreshTokenEncrypted ?? null;
  if (input.refreshToken) {
    refreshTokenEncrypted = await encryptSecret(input.refreshToken);
  }

  if (!refreshTokenEncrypted) {
    throw new AppError(
      "Google did not return a refresh token. Remove Sunbuild access in Google Account permissions and try again.",
      400,
      "GOOGLE_REFRESH"
    );
  }

  const data = {
    googleAccountEmail: input.email ?? null,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiry: input.expiryDate ? new Date(input.expiryDate) : null,
    scope: input.scope ?? GOOGLE_CALENDAR_SCOPES.join(" "),
    status: "CONNECTED",
    googleCalendarId: "primary",
    connectedAt: new Date(),
  };

  if (existing) {
    await prisma.googleCalendarConnection.update({
      where: { id: existing.id },
      data,
    });
  } else {
    await prisma.googleCalendarConnection.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        ...data,
      },
    });
  }

  invalidateGoogleCacheForUser(input.userId);
}

export async function disconnectGoogleCalendar(
  userId: string,
  companyId: string
) {
  const row = await prisma.googleCalendarConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!row) return;

  try {
    const access = await decryptSecret(row.accessTokenEncrypted);
    const client = createOAuth2Client();
    client.setCredentials({
      access_token: access,
      refresh_token: row.refreshTokenEncrypted
        ? await decryptSecret(row.refreshTokenEncrypted)
        : undefined,
    });
    if (row.refreshTokenEncrypted) {
      const refresh = await decryptSecret(row.refreshTokenEncrypted);
      await client.revokeToken(refresh).catch(async () => {
        await client.revokeToken(access).catch(() => undefined);
      });
    } else {
      await client.revokeToken(access).catch(() => undefined);
    }
  } catch {
    // Best-effort revoke; always clear local tokens.
  }

  await prisma.googleCalendarConnection.update({
    where: { id: row.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: await encryptSecret("revoked"),
      refreshTokenEncrypted: null,
      tokenExpiry: null,
      googleAccountEmail: null,
    },
  });
}

async function markReconnectRequired(connectionId: string) {
  await prisma.googleCalendarConnection.update({
    where: { id: connectionId },
    data: { status: "RECONNECT_REQUIRED" },
  });
}

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
  auth: InstanceType<typeof google.auth.OAuth2>;
  connectionId: string;
  calendarId: string;
  scope: string | null;
} | null> {
  const row = await prisma.googleCalendarConnection.findUnique({
    where: { userId_companyId: { userId, companyId } },
  });
  if (!row || row.status === "DISCONNECTED" || !row.refreshTokenEncrypted) {
    return null;
  }
  if (row.status === "RECONNECT_REQUIRED") {
    return null;
  }

  try {
    const client = createOAuth2Client();
    const accessToken = await decryptSecret(row.accessTokenEncrypted);
    const refreshToken = await decryptSecret(row.refreshTokenEncrypted);
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: row.tokenExpiry?.getTime(),
    });

    client.on("tokens", async (tokens) => {
      try {
        const update: {
          accessTokenEncrypted?: string;
          refreshTokenEncrypted?: string;
          tokenExpiry?: Date | null;
          status: string;
        } = { status: "CONNECTED" };
        if (tokens.access_token) {
          update.accessTokenEncrypted = await encryptSecret(tokens.access_token);
        }
        if (tokens.refresh_token) {
          update.refreshTokenEncrypted = await encryptSecret(
            tokens.refresh_token
          );
        }
        if (tokens.expiry_date) {
          update.tokenExpiry = new Date(tokens.expiry_date);
        }
        await prisma.googleCalendarConnection.update({
          where: { id: row.id },
          data: update,
        });
      } catch {
        // Do not throw from token listener.
      }
    });

    // Refresh when expiry is missing OR token is near expiry.
    // Missing expiry previously skipped refresh and caused silent empty calendars.
    const expiresAt = row.tokenExpiry?.getTime() ?? 0;
    const needsRefresh = !expiresAt || expiresAt < Date.now() + 60_000;
    if (needsRefresh) {
      try {
        const refreshed = await client.refreshAccessToken();
        const creds = refreshed.credentials;
        if (creds.access_token) {
          await prisma.googleCalendarConnection.update({
            where: { id: row.id },
            data: {
              accessTokenEncrypted: await encryptSecret(creds.access_token),
              tokenExpiry: creds.expiry_date
                ? new Date(creds.expiry_date)
                : null,
              status: "CONNECTED",
              ...(creds.refresh_token
                ? {
                    refreshTokenEncrypted: await encryptSecret(
                      creds.refresh_token
                    ),
                  }
                : {}),
            },
          });
          client.setCredentials({
            access_token: creds.access_token,
            refresh_token: creds.refresh_token || refreshToken,
            expiry_date: creds.expiry_date,
          });
        }
      } catch (refreshErr) {
        console.error("[google-calendar] token refresh failed:", {
          message:
            refreshErr instanceof Error ? refreshErr.message : "unknown",
        });
        await markReconnectRequired(row.id);
        return null;
      }
    }

    return {
      calendar: google.calendar({ version: "v3", auth: client }),
      auth: client,
      connectionId: row.id,
      calendarId: row.googleCalendarId || "primary",
      scope: row.scope,
    };
  } catch (err) {
    console.error("[google-calendar] auth client failed:", {
      message: err instanceof Error ? err.message : "unknown",
    });
    await markReconnectRequired(row.id);
    return null;
  }
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
    const status = (err as { code?: number })?.code;
    if (status === 401 || status === 403) {
      await markReconnectRequired(authed.connectionId);
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
    const status = (err as { code?: number })?.code;
    if (status === 401 || status === 403) {
      await markReconnectRequired(authed.connectionId);
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
    if (status === 401 || status === 403) {
      await markReconnectRequired(authed.connectionId);
    }
    return false;
  }
}

export type ListedGoogleEvent = {
  googleEventId: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string | null;
  meetUrl: string | null;
  description: string | null;
  calendarId: string;
  calendarName: string | null;
};

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
    const status = (err as { code?: number })?.code;
    console.error("[google-calendar] list events failed:", {
      status,
      message: err instanceof Error ? err.message : "unknown",
    });
    if (status === 401 || status === 403) {
      await markReconnectRequired(authed.connectionId);
      return { events: [], reconnectRequired: true, error: true };
    }
    return { events: [], reconnectRequired: false, error: true };
  }
}
