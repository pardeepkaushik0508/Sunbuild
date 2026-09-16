/**
 * Safe Twilio send-error parsing. Never includes hardcoded recipient numbers.
 */

export type ParsedTwilioSendError = {
  errorCode: string | null;
  errorMessage: string;
  unverifiedRecipient: boolean;
};

const TRIAL_UNVERIFIED_CODES = new Set(["21608", "21610"]);
const INVALID_FROM_CODES = new Set(["21212", "21606", "21601"]);
const INDIA_TEMPLATE_CODES = new Set(["572006", "63027", "63016"]);

function asRecord(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  return err as Record<string, unknown>;
}

function readCode(err: unknown): string | null {
  const rec = asRecord(err);
  const code = rec?.code;
  if (typeof code === "number" && Number.isFinite(code)) return String(code);
  if (typeof code === "string" && code.trim()) return code.trim();
  return null;
}

function readRawMessage(err: unknown): string {
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  const rec = asRecord(err);
  if (typeof rec?.message === "string" && rec.message.trim()) {
    return rec.message.trim();
  }
  return "Twilio could not send this SMS";
}

/** Drop Account SIDs and extra URL noise from Twilio messages before storing. */
export function sanitizeTwilioErrorMessage(raw: string): string {
  return raw
    .replace(/AC[a-f0-9]{32}/gi, "AC…")
    .replace(/https?:\/\/[^\s]+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

export function isUnverifiedRecipientError(
  code: string | null,
  message: string
): boolean {
  if (code && TRIAL_UNVERIFIED_CODES.has(code)) return true;
  return /unverified/i.test(message) && /trial|verify/i.test(message);
}

export const UNVERIFIED_RECIPIENT_DIAGNOSTIC =
  "Recipient must be verified in the Twilio console, or the Twilio account must be upgraded. The original CRM action was not rolled back.";

export const INVALID_FROM_DIAGNOSTIC =
  "TWILIO_PHONE_NUMBER must be a Twilio Console phone number (Phone Numbers → Manage), not a personal mobile. Get a number in Twilio and update the env on Render and .env.local.";

export const INDIA_TEMPLATE_DIAGNOSTIC =
  "This Twilio trial/account requires an approved SMS template for this destination (common for India). Use a Twilio phone number from Console → Phone Numbers, verify the recipient, or upgrade/register SMS templates.";

export function parseTwilioSendError(err: unknown): ParsedTwilioSendError {
  const errorCode = readCode(err);
  const sanitized = sanitizeTwilioErrorMessage(readRawMessage(err));
  const unverifiedRecipient = isUnverifiedRecipientError(errorCode, sanitized);

  let errorMessage = sanitized || "Twilio could not send this SMS";
  if (unverifiedRecipient) {
    errorMessage = UNVERIFIED_RECIPIENT_DIAGNOSTIC;
  } else if (
    (errorCode && INVALID_FROM_CODES.has(errorCode)) ||
    /not a valid|not a twilio|from phone number/i.test(sanitized)
  ) {
    errorMessage = INVALID_FROM_DIAGNOSTIC;
  } else if (
    (errorCode && INDIA_TEMPLATE_CODES.has(errorCode)) ||
    /template name|predefined sms templates/i.test(sanitized)
  ) {
    errorMessage = INDIA_TEMPLATE_DIAGNOSTIC;
  }

  return {
    errorCode,
    errorMessage,
    unverifiedRecipient,
  };
}

export function isUnverifiedRecipientRecord(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
): boolean {
  return isUnverifiedRecipientError(errorCode ?? null, errorMessage ?? "");
}
