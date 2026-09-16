/**
 * Safe Twilio send-error parsing. Never includes hardcoded recipient numbers.
 */

export type ParsedTwilioSendError = {
  errorCode: string | null;
  errorMessage: string;
  unverifiedRecipient: boolean;
};

const TRIAL_UNVERIFIED_CODES = new Set(["21608", "21610"]);

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

export function parseTwilioSendError(err: unknown): ParsedTwilioSendError {
  const errorCode = readCode(err);
  const sanitized = sanitizeTwilioErrorMessage(readRawMessage(err));
  const unverifiedRecipient = isUnverifiedRecipientError(errorCode, sanitized);
  return {
    errorCode,
    errorMessage: unverifiedRecipient
      ? UNVERIFIED_RECIPIENT_DIAGNOSTIC
      : sanitized || "Twilio could not send this SMS",
    unverifiedRecipient,
  };
}

export function isUnverifiedRecipientRecord(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
): boolean {
  return isUnverifiedRecipientError(errorCode ?? null, errorMessage ?? "");
}
