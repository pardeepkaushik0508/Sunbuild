import { appAbsoluteUrl, getAppOrigin } from "@/lib/app-url";
import { TWILIO_INBOUND_PATH, TWILIO_STATUS_PATH } from "@/lib/twilio/constants";

/**
 * Public webhook URLs Twilio calls. Built from APP_URL (then NEXT_PUBLIC_APP_URL /
 * BETTER_AUTH_URL), never from Render's internal PORT or a hardcoded host.
 *
 * Production:  ${APP_URL}/api/twilio/status
 * Future host: set APP_URL=https://sunbuild.aivoxalabs.com — URLs follow.
 */
export function getTwilioWebhookUrls(request?: Request): {
  status: string;
  inbound: string;
} {
  return {
    status: appAbsoluteUrl(TWILIO_STATUS_PATH, request).href,
    inbound: appAbsoluteUrl(TWILIO_INBOUND_PATH, request).href,
  };
}

/**
 * Exact public URL Twilio signed. Replaces the process listen origin (Render PORT)
 * with APP_URL, and keeps path + query from the incoming request.
 */
export function getTwilioRequestUrl(request: Request): string {
  const origin = getAppOrigin(request);
  try {
    const incoming = new URL(request.url);
    return `${origin}${incoming.pathname}${incoming.search}`;
  } catch {
    return origin;
  }
}
