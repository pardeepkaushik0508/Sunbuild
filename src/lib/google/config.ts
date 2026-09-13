import "server-only";

import { AppError } from "@/lib/errors";
import { getAppOrigin } from "@/lib/app-url";

export const GOOGLE_CALENDAR_SCOPES = [
  // Events read/write on calendars the user can access
  "https://www.googleapis.com/auth/calendar.events",
  // Needed to list Birthdays / Holidays / other selected calendars
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
] as const;

export type {
  GoogleConnectionStatus,
  GoogleSyncStatus,
  PublicGoogleConnection,
} from "@/lib/google/types";

export function getGoogleOAuthConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${getAppOrigin()}/api/google/calendar/callback`;

  if (!clientId || !clientSecret) {
    throw new AppError(
      "Google Calendar is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      503,
      "GOOGLE_CONFIG"
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim()
  );
}

/** Activity types eligible for Google Calendar push. */
export const GOOGLE_SYNC_ACTIVITY_TYPES = new Set([
  "MEETING",
  "FOLLOW_UP",
  "SITE_VISIT",
  "CONSULTATION",
  "INSPECTION",
]);
