/**
 * Safe Twilio send-error parsing. Never includes tokens or full Account SIDs.
 */

export type ParsedTwilioSendError = {
  errorCode: string | null;
  errorMessage: string;
  unverifiedRecipient: boolean;
  authFailed: boolean;
  trialRestriction: boolean;
  trialFromMismatch: boolean;
};

const TRIAL_UNVERIFIED_CODES = new Set(["21608", "21610"]);
const INVALID_FROM_CODES = new Set(["21212", "21606", "21601"]);
/** Trial From not assigned to this verified recipient (must use Console trial number). */
const TRIAL_FROM_MISMATCH_CODES = new Set(["572003"]);
const INDIA_TEMPLATE_CODES = new Set(["572006", "63027", "63016"]);
const AUTH_FAILED_CODES = new Set(["20003"]);
const TRIAL_GEO_CODES = new Set([
  "21408",
  "21612",
  "21215",
  "21214",
  "21614",
]);

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

export function isTrialRestrictionError(
  code: string | null,
  message: string
): boolean {
  if (code && TRIAL_GEO_CODES.has(code)) return true;
  if (code && INDIA_TEMPLATE_CODES.has(code)) return true;
  return (
    /permission.*region|not.*enabled.*region|geographic|country.*(not|isn't) supported|trial.*(cannot|can't|not).*(send|deliver)|destination.*(not|isn't).*(supported|allowed)/i.test(
      message
    )
  );
}

export const UNVERIFIED_RECIPIENT_DIAGNOSTIC =
  "Recipient must be verified in the Twilio console, or the Twilio account must be upgraded. The original CRM action was not rolled back.";

export const INVALID_FROM_DIAGNOSTIC =
  "TWILIO_PHONE_NUMBER must be a Twilio Console phone number (Phone Numbers → Manage) owned by this account. Update the env on Render and .env.local, then redeploy.";

export const TRIAL_FROM_MISMATCH_DIAGNOSTIC =
  "Error 572003: Set TWILIO_PHONE_NUMBER to the exact Twilio trial From number shown in Twilio Console → Messaging → Try out SMS for this recipient (labeled “Twilio trial number”), then redeploy. Do not use a personal mobile as From.";

export const MISSING_TRIAL_FROM_DIAGNOSTIC =
  "MISSING_TRIAL_FROM: Current Twilio trial requires TWILIO_PHONE_NUMBER set to the From value on Console → Messaging → Try out SMS (Twilio trial number). Without it, Twilio returns 572003.";

export const TRIAL_RESTRICTION_DIAGNOSTIC =
  "Recipient is not supported by the current Twilio trial configuration. Verify the recipient in Twilio Console → Messaging → Try out SMS and use a destination allowed by this trial.";

export const AUTH_FAILED_DIAGNOSTIC =
  "TWILIO_AUTH_FAILED: Twilio rejected Account SID / Auth Token (often error 20003). Check server env only — never expose the token.";

export const INVALID_TRIAL_TEMPLATE_DIAGNOSTIC =
  "INVALID_TRIAL_TEMPLATE: TWILIO_TRIAL_TEMPLATE must be one of Twilio's supported trial template identifiers (default sms_internal_alerts).";

export const INVALID_RECIPIENT_DIAGNOSTIC =
  "INVALID_RECIPIENT_NUMBER: Recipient phone must be a valid E.164 number (example +14035550100). Ambiguous local numbers are not auto-converted without country context.";

export function isTrialFromMismatchError(
  code: string | null,
  message: string
): boolean {
  if (code && TRIAL_FROM_MISMATCH_CODES.has(code)) return true;
  return (
    /from['']?\s*number.*(isn't|is not|not).*assigned.*verified.*recipient/i.test(
      message
    ) || /using your assigned trial number/i.test(message)
  );
}

export function parseTwilioSendError(err: unknown): ParsedTwilioSendError {
  const errorCode = readCode(err);
  const sanitized = sanitizeTwilioErrorMessage(readRawMessage(err));
  const unverifiedRecipient = isUnverifiedRecipientError(errorCode, sanitized);
  const authFailed =
    (errorCode != null && AUTH_FAILED_CODES.has(errorCode)) ||
    /authenticate|authentication error/i.test(sanitized);
  const trialFromMismatch = isTrialFromMismatchError(errorCode, sanitized);
  const trialRestriction = isTrialRestrictionError(errorCode, sanitized);

  let errorMessage = sanitized || "Twilio could not send this SMS";
  if (authFailed) {
    errorMessage = AUTH_FAILED_DIAGNOSTIC;
  } else if (trialFromMismatch) {
    errorMessage = TRIAL_FROM_MISMATCH_DIAGNOSTIC;
  } else if (unverifiedRecipient) {
    errorMessage = UNVERIFIED_RECIPIENT_DIAGNOSTIC;
  } else if (trialRestriction) {
    errorMessage = TRIAL_RESTRICTION_DIAGNOSTIC;
  } else if (
    (errorCode && INVALID_FROM_CODES.has(errorCode)) ||
    /not a valid|not a twilio|from phone number/i.test(sanitized)
  ) {
    errorMessage = INVALID_FROM_DIAGNOSTIC;
  } else if (
    (errorCode && INDIA_TEMPLATE_CODES.has(errorCode)) ||
    /template name|predefined sms templates/i.test(sanitized)
  ) {
    errorMessage = TRIAL_RESTRICTION_DIAGNOSTIC;
  }

  return {
    errorCode,
    errorMessage,
    unverifiedRecipient,
    authFailed,
    trialRestriction,
    trialFromMismatch,
  };
}

export function isUnverifiedRecipientRecord(
  errorCode: string | null | undefined,
  errorMessage: string | null | undefined
): boolean {
  return isUnverifiedRecipientError(errorCode ?? null, errorMessage ?? "");
}
