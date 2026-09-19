/**
 * Phone normalization for Twilio E.164.
 *
 * Never blindly prepend +1 or +91. Use explicit country context when a local
 * number has no country code. Ambiguous numbers are INVALID_PHONE.
 */

export type PhoneRegion = "CA" | "US" | "IN";

export type PhoneNormalizeOptions = {
  /** ISO-ish region hint from company/user context. */
  defaultRegion?: PhoneRegion | null;
};

export type PhoneNormalizeResult =
  | { ok: true; e164: string }
  | { ok: false; reason: "EMPTY" | "INVALID_PHONE" };

const CANADIAN_PROVINCES = new Set([
  "AB",
  "BC",
  "MB",
  "NB",
  "NL",
  "NS",
  "NT",
  "NU",
  "ON",
  "PE",
  "QC",
  "SK",
  "YT",
  "ALBERTA",
  "BRITISH COLUMBIA",
  "MANITOBA",
  "NEW BRUNSWICK",
  "NEWFOUNDLAND",
  "NOVA SCOTIA",
  "ONTARIO",
  "QUEBEC",
  "SASKATCHEWAN",
  "YUKON",
  "CANADA",
  "CA",
]);

const US_STATES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID",
  "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS",
  "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK",
  "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV",
  "WI", "WY", "DC", "USA", "US", "UNITED STATES",
]);

/** Digits-only form used for matching stored CRM phone values. */
export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function inferPhoneRegion(input?: {
  province?: string | null;
  country?: string | null;
}): PhoneRegion | null {
  const country = (input?.country || "").trim().toUpperCase();
  if (country === "IN" || country === "INDIA") return "IN";
  if (country === "US" || country === "USA" || country === "UNITED STATES") {
    return "US";
  }
  if (country === "CA" || country === "CANADA") return "CA";

  const province = (input?.province || "").trim().toUpperCase();
  if (!province) return null;
  if (province === "INDIA" || province === "IN") return "IN";
  if (CANADIAN_PROVINCES.has(province)) return "CA";
  if (US_STATES.has(province) && province !== "IN") return "US";
  return null;
}

export function normalizeToE164(
  phone: string | null | undefined,
  options?: PhoneNormalizeOptions
): PhoneNormalizeResult {
  const trimmed = (phone || "").trim();
  if (!trimmed) return { ok: false, reason: "EMPTY" };

  if (trimmed.startsWith("+")) {
    const rest = digitsOnly(trimmed.slice(1));
    if (rest.length < 8 || rest.length > 15) {
      return { ok: false, reason: "INVALID_PHONE" };
    }
    return { ok: true, e164: `+${rest}` };
  }

  const digits = digitsOnly(trimmed);
  if (!digits) return { ok: false, reason: "INVALID_PHONE" };

  if (digits.length === 11 && digits.startsWith("1")) {
    return { ok: true, e164: `+${digits}` };
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return { ok: true, e164: `+${digits}` };
  }

  if (digits.length === 10) {
    const region = options?.defaultRegion ?? null;
    if (region === "CA" || region === "US") {
      return { ok: true, e164: `+1${digits}` };
    }
    if (region === "IN") {
      return { ok: true, e164: `+91${digits}` };
    }
    return { ok: false, reason: "INVALID_PHONE" };
  }

  if (digits.length >= 8 && digits.length <= 15 && options?.defaultRegion) {
    return { ok: false, reason: "INVALID_PHONE" };
  }

  return { ok: false, reason: "INVALID_PHONE" };
}

/**
 * Normalize a user-entered phone to E.164.
 * Local 10-digit numbers require defaultRegion; they are not assumed to be +1.
 */
export function toE164(
  phone: string,
  options?: PhoneNormalizeOptions
): string | null {
  const result = normalizeToE164(phone, options);
  return result.ok ? result.e164 : null;
}

/** Last 10 digits — stable enough to match CRM numbers stored with/without +1. */
export function phoneMatchTail(phone: string): string {
  const digits = digitsOnly(phone);
  return digits.slice(-10);
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = digitsOnly(phone);
  if (digits.length < 4) return "••••";
  return `+••••${digits.slice(-4)}`;
}

export function maskSid(sid: string | null | undefined): string | null {
  const v = sid?.trim();
  if (!v) return null;
  if (v.length <= 6) return "••••";
  return `${v.slice(0, 2)}••••${v.slice(-4)}`;
}

export function stripWhatsAppPrefix(value: string): string {
  return value.replace(/^whatsapp:/i, "").trim();
}

export function toWhatsAppAddress(e164OrRaw: string): string {
  const stripped = stripWhatsAppPrefix(e164OrRaw);
  const e164 = stripped.startsWith("+") ? stripped : toE164(stripped);
  return `whatsapp:${e164 || stripped}`;
}
