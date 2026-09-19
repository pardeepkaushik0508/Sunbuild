/**
 * Resolve what Twilio actually receives vs the intended CRM SMS body.
 * Trial path deliberately reuses existing resolveOutboundTwilioBody behavior.
 */

import { getSmsOperatingMode, type SmsOperatingMode } from "@/lib/sms/mode";
import {
  contentSidForSmsEvent,
  smsContentVariables,
  type SmsTemplateContext,
} from "@/lib/sms/templates";
import { resolveOutboundTwilioBody } from "@/lib/twilio/payload";
import { resolveTwilioTrialTemplate } from "@/lib/twilio/mode";

export type SmsProviderOutbound =
  | {
      ok: true;
      mode: SmsOperatingMode;
      /** Body Twilio receives when using body-based send. */
      twilioBody: string | null;
      intendedBody: string;
      trialTemplate: string | null;
      contentSid: string | null;
      contentVariables: Record<string, string> | null;
    }
  | {
      ok: false;
      mode: SmsOperatingMode;
      code: string;
      message: string;
      intendedBody: string;
    };

/**
 * Trial: keep global TWILIO_TRIAL_TEMPLATE (do not switch to per-event ids).
 * Custom: send rendered production body.
 * Content: ContentSid + variables (no conflicting body).
 */
export function resolveSmsProviderOutbound(input: {
  intendedBody: string;
  eventType: string;
  context: SmsTemplateContext;
  /** TwilioConfig.mode trial|production — used only for legacy body helper. */
  twilioMode: "trial" | "production";
}): SmsProviderOutbound {
  const intended = input.intendedBody.trim();
  const mode = getSmsOperatingMode();

  if (mode === "TRIAL") {
    const outbound = resolveOutboundTwilioBody(
      { mode: "trial" },
      intended
    );
    if (!outbound.ok) {
      return {
        ok: false,
        mode,
        code: outbound.code,
        message: outbound.message,
        intendedBody: intended,
      };
    }
    return {
      ok: true,
      mode,
      twilioBody: outbound.twilioBody,
      intendedBody: outbound.intendedBody,
      trialTemplate: outbound.trialTemplate,
      contentSid: null,
      contentVariables: null,
    };
  }

  if (mode === "CONTENT_TEMPLATE") {
    const contentSid = contentSidForSmsEvent(input.eventType);
    if (!contentSid) {
      return {
        ok: false,
        mode,
        code: "CONTENT_SID_MISSING",
        message:
          "TWILIO_SMS_MODE=content requires a Content SID env for this event (e.g. TWILIO_CONTENT_INVOICE_OVERDUE).",
        intendedBody: intended,
      };
    }
    return {
      ok: true,
      mode,
      twilioBody: null,
      intendedBody: intended,
      trialTemplate: null,
      contentSid,
      contentVariables: smsContentVariables(input.eventType, input.context),
    };
  }

  // CUSTOM_BODY — production dynamic text
  if (!intended) {
    return {
      ok: false,
      mode,
      code: "TEMPLATE_DATA_INVALID",
      message: "Production SMS body is empty.",
      intendedBody: intended,
    };
  }

  return {
    ok: true,
    mode,
    twilioBody: intended,
    intendedBody: intended,
    trialTemplate: null,
    contentSid: null,
    contentVariables: null,
  };
}

/** Safe diagnostic for settings UI. */
export function smsModeDiagnostics(): {
  mode: SmsOperatingMode;
  trialTemplate: string | null;
  label: string;
} {
  const mode = getSmsOperatingMode();
  const trial = resolveTwilioTrialTemplate();
  return {
    mode,
    trialTemplate: trial.ok ? trial.template : null,
    label:
      mode === "TRIAL"
        ? "Trial"
        : mode === "CONTENT_TEMPLATE"
          ? "Content Template"
          : "Custom production body",
  };
}
