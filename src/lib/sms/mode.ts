/**
 * SMS operating mode — independent of business notification rules.
 *
 * Trial keeps using Twilio's predefined body identifiers.
 * Custom body / ContentSid are production upgrade paths only.
 */

export type SmsOperatingMode = "TRIAL" | "CUSTOM_BODY" | "CONTENT_TEMPLATE";

/**
 * Resolve SMS provider mode.
 * Prefer TWILIO_SMS_MODE; fall back to TWILIO_MODE for compatibility.
 * Default remains Trial so current accounts keep working.
 */
export function getSmsOperatingMode(
  env: NodeJS.ProcessEnv = process.env
): SmsOperatingMode {
  const smsMode = env.TWILIO_SMS_MODE?.trim().toLowerCase();
  if (smsMode === "content" || smsMode === "content_template") {
    return "CONTENT_TEMPLATE";
  }
  if (smsMode === "custom" || smsMode === "custom_body" || smsMode === "production") {
    return "CUSTOM_BODY";
  }
  if (smsMode === "trial") return "TRIAL";

  const twilioMode = env.TWILIO_MODE?.trim().toLowerCase();
  if (twilioMode === "production") return "CUSTOM_BODY";
  return "TRIAL";
}

export function smsModeLabel(mode: SmsOperatingMode): string {
  switch (mode) {
    case "TRIAL":
      return "Trial";
    case "CUSTOM_BODY":
      return "Custom production body";
    case "CONTENT_TEMPLATE":
      return "Twilio Content Template";
  }
}
