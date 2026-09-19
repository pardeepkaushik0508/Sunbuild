/**
 * Pure helpers for binding outbound SMS destinations to CRM entities.
 * Keeps browser `to` overrides from becoming an open relay.
 */

import { phoneMatchTail, toE164, type PhoneRegion } from "@/lib/twilio/phone";

export function smsDestinationMatchesEntity(input: {
  requestedTo: string | null | undefined;
  entityPhone: string | null | undefined;
  defaultRegion?: PhoneRegion | null;
}): { ok: true } | { ok: false; code: "SMS_DESTINATION_MISMATCH" } {
  const requested = input.requestedTo?.trim() || "";
  if (!requested) return { ok: true };

  const region = input.defaultRegion ?? null;
  const requestedE164 = toE164(requested, { defaultRegion: region });
  const entityE164 = toE164(input.entityPhone || "", { defaultRegion: region });
  if (requestedE164 && entityE164 && requestedE164 === entityE164) {
    return { ok: true };
  }

  const requestedTail = phoneMatchTail(requested);
  const entityTail = phoneMatchTail(input.entityPhone || "");
  if (
    requestedTail.length >= 7 &&
    entityTail.length >= 7 &&
    requestedTail === entityTail
  ) {
    return { ok: true };
  }

  return { ok: false, code: "SMS_DESTINATION_MISMATCH" };
}
