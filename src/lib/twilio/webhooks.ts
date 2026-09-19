import { getAppOrigin } from "@/lib/app-url";
import {
  TWILIO_INBOUND_PATH,
  TWILIO_SMS_STATUS_PATH,
  TWILIO_WHATSAPP_INCOMING_PATH,
  TWILIO_WHATSAPP_STATUS_PATH,
} from "@/lib/twilio/constants";

function trimOrigin(value: string): string {
  return value.trim().replace(/\/$/, "");
}

function isLocalHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  );
}

export function isPublicHttpOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (isLocalHostname(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Origin Twilio should call back. Prefer an explicit public tunnel in local
 * development; never send localhost/Render-internal URLs to Twilio.
 */
export function getTwilioWebhookOrigin(request?: Request): string | null {
  const tunnel = process.env.TWILIO_WEBHOOK_BASE_URL?.trim();
  if (tunnel) {
    const origin = trimOrigin(tunnel);
    return isPublicHttpOrigin(origin) ? origin : null;
  }
  const origin = getAppOrigin(request);
  return isPublicHttpOrigin(origin) ? origin : null;
}

function absoluteOnOrigin(origin: string, path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(normalized, `${origin}/`).href;
}

export type TwilioWebhookUrls = {
  status: string;
  inbound: string;
  smsStatus: string;
  whatsappStatus: string;
  whatsappIncoming: string;
  /** False when APP_URL is localhost and no public tunnel is configured. */
  public: boolean;
};

/**
 * Public webhook URLs Twilio calls. Built from APP_URL (or TWILIO_WEBHOOK_BASE_URL),
 * never from Render's internal PORT or a hardcoded host.
 *
 * Production:
 *   ${APP_URL}/api/twilio/sms/status
 *   ${APP_URL}/api/twilio/whatsapp/status
 *   ${APP_URL}/api/twilio/whatsapp/incoming
 */
export function getTwilioWebhookUrls(request?: Request): TwilioWebhookUrls {
  const origin = getTwilioWebhookOrigin(request);
  if (!origin) {
    return {
      status: "",
      inbound: "",
      smsStatus: "",
      whatsappStatus: "",
      whatsappIncoming: "",
      public: false,
    };
  }
  return {
    status: absoluteOnOrigin(origin, TWILIO_SMS_STATUS_PATH),
    inbound: absoluteOnOrigin(origin, TWILIO_INBOUND_PATH),
    smsStatus: absoluteOnOrigin(origin, TWILIO_SMS_STATUS_PATH),
    whatsappStatus: absoluteOnOrigin(origin, TWILIO_WHATSAPP_STATUS_PATH),
    whatsappIncoming: absoluteOnOrigin(origin, TWILIO_WHATSAPP_INCOMING_PATH),
    public: true,
  };
}

/**
 * Exact public URL Twilio signed. Replaces the process listen origin (Render PORT)
 * with APP_URL / tunnel origin, and keeps path + query from the incoming request.
 */
export function getTwilioRequestUrl(request: Request): string {
  const webhookOrigin = getTwilioWebhookOrigin(request);
  const origin = webhookOrigin || getAppOrigin(request);
  try {
    const incoming = new URL(request.url);
    return `${origin}${incoming.pathname}${incoming.search}`;
  } catch {
    return origin;
  }
}

export function shouldAttachStatusCallback(): boolean {
  return getTwilioWebhookUrls().public;
}
