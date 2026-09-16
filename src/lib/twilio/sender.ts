/**
 * Twilio sender selection by TWILIO_MODE.
 *
 * Trial: SID + Auth Token only (Twilio supplies the trial From; do not require TWILIO_PHONE_NUMBER).
 * Production: SID + Auth Token + TWILIO_PHONE_NUMBER and/or TWILIO_MESSAGING_SERVICE_SID.
 */

import { getTwilioMode, type TwilioMode } from "@/lib/twilio/mode";

export type TwilioSenderMode =
  | "trial"
  | "messaging_service"
  | "phone_number"
  | "not_configured";

/**
 * Normalize TWILIO_ACCOUNT_SID.
 * Common copy/paste glues the SID twice (AC…32hex + AC…32hex) which Twilio
 * rejects as Authentication Error 20003 "invalid username".
 */
export function normalizeTwilioAccountSid(raw: string): string {
  const sid = raw.trim();
  const dup = sid.match(/^(AC[a-f0-9]{32})\1$/i);
  if (dup) return dup[1];
  return sid;
}

export function getTwilioSenderMode(): TwilioSenderMode {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return "not_configured";

  const mode = getTwilioMode();
  if (mode === "trial") return "trial";

  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (messagingServiceSid) return "messaging_service";
  if (phoneNumber) return "phone_number";
  return "not_configured";
}

/**
 * Fields passed to Twilio Messages.create for production.
 * Trial payloads must not include from / messagingServiceSid.
 */
export function selectTwilioFromFields(input: {
  mode: TwilioMode;
  messagingServiceSid: string | null;
  phoneNumber: string | null;
}): { messagingServiceSid?: string; from?: string } {
  if (input.mode === "trial") return {};

  const messagingServiceSid = input.messagingServiceSid?.trim() || null;
  const phoneNumber = input.phoneNumber?.trim() || null;
  if (messagingServiceSid) return { messagingServiceSid };
  if (phoneNumber) return { from: phoneNumber };
  return {};
}
