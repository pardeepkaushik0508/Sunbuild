import "server-only";

import { OAuth2Client } from "google-auth-library";
import { prisma } from "@/lib/db";
import {
  getGoogleOAuthConfig,
  GOOGLE_CALENDAR_SCOPES,
  hasGoogleTasksScope,
  normalizeGrantedScopes,
  type GoogleConnectionStatus,
} from "@/lib/google/config";
import type { PublicGoogleConnection } from "@/lib/google/types";
import { decryptSecret, encryptSecret } from "@/lib/google/crypto";
import { invalidateGoogleCacheForUser } from "@/lib/google/cache";
import {
  classifyGoogleError,
  googleErrorLogFields,
} from "@/lib/google/errors";
import { AppError } from "@/lib/errors";

export type { PublicGoogleConnection } from "@/lib/google/types";

export function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getGoogleOAuthConfig();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
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
    const { oauth2 } = await import("@googleapis/oauth2");
    const client = createOAuth2Client();
    client.setCredentials({ access_token: accessToken });
    const api = oauth2({ version: "v2", auth: client });
    const me = await api.userinfo.get();
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
      scope: true,
    },
  });
  if (!row || row.status === "DISCONNECTED") {
    return {
      connected: false,
      status: "NOT_CONNECTED",
      email: null,
      configured,
      tasksScopeGranted: false,
      hasRefreshToken: false,
    };
  }
  return {
    connected: row.status === "CONNECTED",
    status: row.status as GoogleConnectionStatus,
    email: row.googleAccountEmail,
    configured,
    tasksScopeGranted: hasGoogleTasksScope(row.scope),
    hasRefreshToken: Boolean(row.refreshTokenEncrypted),
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
    select: { id: true, refreshTokenEncrypted: true, scope: true },
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

  // Persist ACTUAL granted scopes from Google — never invent Tasks as granted.
  // Empty/missing token scope → keep prior DB scope, else null (live API probe).
  const fromGoogle = normalizeGrantedScopes(input.scope, false);
  const scope =
    fromGoogle ||
    (existing?.scope?.trim() ? existing.scope.trim() : null);

  console.info("[google-oauth] connection saved", {
    userId: input.userId,
    companyId: input.companyId,
    hasRefreshToken: true,
    scopeNames: scope ? scope.split(/\s+/).filter(Boolean) : [],
    tasksScopeGranted: hasGoogleTasksScope(scope),
  });

  const data = {
    googleAccountEmail: input.email ?? null,
    accessTokenEncrypted,
    refreshTokenEncrypted,
    tokenExpiry: input.expiryDate ? new Date(input.expiryDate) : null,
    scope,
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

  // Must clear both events + tasks caches (including legacy gcal-tasks: keys).
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
      scope: null,
    },
  });
  invalidateGoogleCacheForUser(userId);
}

export async function markGoogleReconnectRequired(connectionId: string) {
  await prisma.googleCalendarConnection.update({
    where: { id: connectionId },
    data: { status: "RECONNECT_REQUIRED" },
  });
}

/**
 * Returns an authenticated Google OAuth2 client for the user.
 * Refreshes access tokens automatically. Marks reconnect when refresh fails
 * with an auth-revoked classification — never solely because access expired.
 */
export async function getAuthedGoogleClient(
  userId: string,
  companyId: string
): Promise<{
  auth: OAuth2Client;
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
          scope?: string;
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
        if (tokens.scope) {
          update.scope =
            normalizeGrantedScopes(tokens.scope, false) || undefined;
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
    // Access expiry alone must never force RECONNECT_REQUIRED.
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
              ...(creds.scope
                ? { scope: normalizeGrantedScopes(creds.scope, false) }
                : {}),
            },
          });
          client.setCredentials({
            access_token: creds.access_token,
            refresh_token: creds.refresh_token || refreshToken,
            expiry_date: creds.expiry_date,
          });
          console.info("[google-auth] access token refreshed", {
            userId,
            companyId,
            preservedRefreshToken: !creds.refresh_token,
          });
        }
      } catch (refreshErr) {
        const classified = classifyGoogleError(refreshErr, "oauth");
        console.error("[google-auth] token refresh failed:", {
          userId,
          companyId,
          ...googleErrorLogFields(refreshErr, classified),
        });
        // Network blips should not force reconnect; auth revocation must.
        if (classified.requiresReconnect) {
          await markGoogleReconnectRequired(row.id);
          invalidateGoogleCacheForUser(userId);
        }
        return null;
      }
    }

    return {
      auth: client,
      connectionId: row.id,
      calendarId: row.googleCalendarId || "primary",
      scope: row.scope,
    };
  } catch (err) {
    const classified = classifyGoogleError(err, "oauth");
    console.error("[google-auth] auth client failed:", {
      userId,
      companyId,
      ...googleErrorLogFields(err, classified),
    });
    await markGoogleReconnectRequired(row.id);
    invalidateGoogleCacheForUser(userId);
    return null;
  }
}
