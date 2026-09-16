const NANP_DEFAULT_COUNTRY = "1";

/** Digits-only form used for matching stored CRM phone values. */
export function digitsOnly(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

/**
 * Normalize a user-entered phone to E.164.
 * 10-digit numbers are treated as North American (+1) for Sunview Homes.
 */
export function toE164(phone: string): string | null {
  const trimmed = phone.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("+")) {
    const rest = digitsOnly(trimmed.slice(1));
    if (rest.length < 8 || rest.length > 15) return null;
    return `+${rest}`;
  }

  const digits = digitsOnly(trimmed);
  if (digits.length === 10) {
    return `+${NANP_DEFAULT_COUNTRY}${digits}`;
  }
  if (digits.length === 11 && digits.startsWith(NANP_DEFAULT_COUNTRY)) {
    return `+${digits}`;
  }
  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }
  return null;
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
