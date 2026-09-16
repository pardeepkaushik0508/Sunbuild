/**
 * Twilio sender selection. Messaging Service is optional (trial uses a phone number).
 *
 * Priority:
 * 1. TWILIO_MESSAGING_SERVICE_SID → production Messaging Service
 * 2. TWILIO_PHONE_NUMBER → direct From number (current trial)
 * 3. otherwise → not_configured
 */

export type TwilioSenderMode =
  | "messaging_service"
  | "phone_number"
  | "not_configured";

export function getTwilioSenderMode(): TwilioSenderMode {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim();

  if (!accountSid || !authToken) return "not_configured";
  if (messagingServiceSid) return "messaging_service";
  if (phoneNumber) return "phone_number";
  return "not_configured";
}

/** Fields passed to Twilio Messages.create. Messaging Service is never required. */
export function selectTwilioFromFields(input: {
  messagingServiceSid: string | null;
  phoneNumber: string | null;
}): { messagingServiceSid?: string; from?: string } {
  const messagingServiceSid = input.messagingServiceSid?.trim() || null;
  const phoneNumber = input.phoneNumber?.trim() || null;
  if (messagingServiceSid) return { messagingServiceSid };
  if (phoneNumber) return { from: phoneNumber };
  return {};
}
