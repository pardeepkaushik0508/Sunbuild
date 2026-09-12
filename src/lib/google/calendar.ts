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
  connectionId: string;
  calendarId: string;
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

    // Only refresh when token is missing expiry or already expired.
    // Avoids an extra Google round-trip on every calendar fetch.
    const expiresAt = row.tokenExpiry?.getTime() ?? 0;
    if (expiresAt && expiresAt < Date.now() + 30_000) {
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
        client.setCredentials(creds);
      }
    }

    return {
      calendar: google.calendar({ version: "v3", auth: client }),
      connectionId: row.id,
      calendarId: row.googleCalendarId || "primary",
    };
  } catch {
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
};

export async function listGoogleEventsInRange(
  userId: string,
  companyId: string,
  timeMin: Date,
  timeMax: Date
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
  const cached = getGoogleCache<{
    events: ListedGoogleEvent[];
    reconnectRequired: boolean;
    error: boolean;
  }>(cacheKey);
  if (cached) return cached;

  const authed = await getAuthedCalendarClient(userId, companyId);
  if (!authed) {
    const row = await prisma.googleCalendarConnection.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { status: true },
    });
    return {
      events: [],
      reconnectRequired: row?.status === "RECONNECT_REQUIRED",
      error: false,
    };
  }

  try {
    const res = await authed.calendar.events.list({
      calendarId: authed.calendarId,
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
      // Smaller payload = faster response
      fields:
        "items(id,status,summary,start,end,location,hangoutLink,conferenceData/entryPoints)",
    });

    const events: ListedGoogleEvent[] = [];
    for (const item of res.data.items ?? []) {
      if (!item.id || item.status === "cancelled") continue;
      const startRaw = item.start?.dateTime || item.start?.date;
      const endRaw = item.end?.dateTime || item.end?.date;
      if (!startRaw) continue;
      const allDay = Boolean(item.start?.date && !item.start?.dateTime);
      events.push({
        googleEventId: item.id,
        title: item.summary || "(No title)",
        start: new Date(startRaw),
        end: endRaw ? new Date(endRaw) : new Date(startRaw),
        allDay,
        location: item.location ?? null,
        meetUrl:
          item.hangoutLink ||
          item.conferenceData?.entryPoints?.find(
            (e) => e.entryPointType === "video"
          )?.uri ||
          null,
        description: null,
      });
    }
    const result = { events, reconnectRequired: false, error: false };
    setGoogleCache(cacheKey, result, 45_000);
    return result;
  } catch (err) {
    const status = (err as { code?: number })?.code;
    if (status === 401 || status === 403) {
      await markReconnectRequired(authed.connectionId);
      return { events: [], reconnectRequired: true, error: true };
    }
    return { events: [], reconnectRequired: false, error: true };
  }
}
