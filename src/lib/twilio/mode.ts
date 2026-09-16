/**
 * Twilio operating mode: current free-trial SMS vs paid/production SMS.
 *
 * Trial Create Message: to, body (template id), statusCallback, and from
 * (Twilio trial number from Console → Try out SMS — required to avoid 572003).
 * Production: to, from (or Messaging Service), custom body, statusCallback.
 */

export const TWILIO_TRIAL_TEMPLATES = [
  "sms_2fa",
  "sms_appointment_reminders",
  "sms_order_confirmation",
  "sms_delivery_updates",
  "sms_customer_support",
  "sms_marketing_promotions",
  "sms_event_notifications",
  "sms_account_alerts",
  "sms_feedback_surveys",
  "sms_internal_alerts",
] as const;

export type TwilioTrialTemplate = (typeof TWILIO_TRIAL_TEMPLATES)[number];

export const DEFAULT_TWILIO_TRIAL_TEMPLATE: TwilioTrialTemplate =
  "sms_internal_alerts";

export type TwilioMode = "trial" | "production";

const TRIAL_TEMPLATE_SET = new Set<string>(TWILIO_TRIAL_TEMPLATES);

export function getTwilioMode(): TwilioMode {
  const raw = process.env.TWILIO_MODE?.trim().toLowerCase();
  if (raw === "production") return "production";
  return "trial";
}

export function isTwilioTrialTemplate(value: string): value is TwilioTrialTemplate {
  return TRIAL_TEMPLATE_SET.has(value);
}

/**
 * Resolve the trial body template from env.
 * Missing → sms_internal_alerts.
 * Invalid → null (caller must not send; use INVALID_TRIAL_TEMPLATE).
 */
export function resolveTwilioTrialTemplate(): {
  ok: true;
  template: TwilioTrialTemplate;
  fromEnv: boolean;
} | {
  ok: false;
  raw: string;
} {
  const raw = process.env.TWILIO_TRIAL_TEMPLATE?.trim();
  if (!raw) {
    return {
      ok: true,
      template: DEFAULT_TWILIO_TRIAL_TEMPLATE,
      fromEnv: false,
    };
  }
  if (!isTwilioTrialTemplate(raw)) {
    return { ok: false, raw };
  }
  return { ok: true, template: raw, fromEnv: true };
}

/** Safe Account SID display: AC••••••••1234 — never the full SID. */
export function maskAccountSid(sid: string | null | undefined): string | null {
  const v = sid?.trim();
  if (!v) return null;
  if (v.length < 8) return "••••";
  return `${v.slice(0, 2)}••••••••${v.slice(-4)}`;
}
