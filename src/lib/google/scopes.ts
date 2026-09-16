/**
 * Pure Google OAuth scope helpers (no server-only — safe for unit tests).
 */

export const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/tasks.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
] as const;

/** True when the stored OAuth grant includes Google Tasks read access. */
export function hasGoogleTasksScope(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return (
    scope.includes("https://www.googleapis.com/auth/tasks.readonly") ||
    scope.includes("https://www.googleapis.com/auth/tasks")
  );
}

/** True when stored scope includes Calendar events write. */
export function hasGoogleCalendarEventsScope(
  scope: string | null | undefined
): boolean {
  if (!scope) return false;
  return (
    scope.includes("https://www.googleapis.com/auth/calendar.events") ||
    scope.includes("https://www.googleapis.com/auth/calendar")
  );
}

/**
 * Normalize Google's space-delimited scope string.
 * Prefer the actual granted scopes from the token response over configured defaults.
 */
export function normalizeGrantedScopes(
  granted: string | null | undefined,
  fallbackToConfigured = true
): string {
  const parts = (granted ?? "")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return fallbackToConfigured ? GOOGLE_CALENDAR_SCOPES.join(" ") : "";
  }
  return [...new Set(parts)].join(" ");
}
