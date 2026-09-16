/**
 * Paths that middleware allows without a session cookie.
 * Handlers still enforce signatures / verify tokens / return only public-safe data.
 */
export const MIDDLEWARE_PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/api/auth",
  // Public-safe password policy for reset forms (no secrets returned)
  "/api/settings/password-policy",
  // External provider webhooks — handlers enforce signatures / verify tokens
  "/api/twilio/status",
  "/api/twilio/inbound",
  "/api/whatsapp/webhook",
] as const;
