/**
 * Pure outbound body / Messages.create payload helpers (no server-only).
 * Safe to unit-test without the Twilio SDK.
 */

import type { TwilioMode } from "@/lib/twilio/mode";
import { resolveTwilioTrialTemplate } from "@/lib/twilio/mode";
import { selectTwilioFromFields } from "@/lib/twilio/sender";
import {
  INVALID_TRIAL_TEMPLATE_DIAGNOSTIC,
  MISSING_TRIAL_FROM_DIAGNOSTIC,
} from "@/lib/twilio/errors";

export type OutboundBodyConfig = {
  mode: TwilioMode;
  messagingServiceSid: string | null;
  phoneNumber: string | null;
};

/**
 * Resolve the body Twilio receives vs the intended CRM text we store.
 * Trial always sends a whitelist template id; production sends the real text.
 */
export function resolveOutboundTwilioBody(
  config: Pick<OutboundBodyConfig, "mode">,
  intendedBody: string
):
  | {
      ok: true;
      twilioBody: string;
      intendedBody: string;
      trialTemplate: string | null;
    }
  | { ok: false; code: "INVALID_TRIAL_TEMPLATE"; message: string } {
  const intended = intendedBody.trim();
  if (config.mode !== "trial") {
    return {
      ok: true,
      twilioBody: intended,
      intendedBody: intended,
      trialTemplate: null,
    };
  }

  const resolved = resolveTwilioTrialTemplate();
  if (!resolved.ok) {
    return {
      ok: false,
      code: "INVALID_TRIAL_TEMPLATE",
      message: INVALID_TRIAL_TEMPLATE_DIAGNOSTIC,
    };
  }

  return {
    ok: true,
    twilioBody: resolved.template,
    intendedBody: intended,
    trialTemplate: resolved.template,
  };
}

export type TwilioMessagePayload = {
  to: string;
  body: string;
  statusCallback?: string;
  messagingServiceSid?: string;
  from?: string;
};

/**
 * Build the Twilio Messages.create payload.
 * Trial: to + body (template id) + statusCallback + from (Twilio trial number).
 * Production: to + body + from/messagingServiceSid + statusCallback.
 */
export function buildTwilioMessagePayload(
  config: OutboundBodyConfig,
  input: { to: string; body: string; statusCallback: string }
): TwilioMessagePayload {
  const payload: TwilioMessagePayload = {
    to: input.to,
    body: input.body,
    statusCallback: input.statusCallback,
    ...selectTwilioFromFields({
      mode: config.mode,
      messagingServiceSid: config.messagingServiceSid,
      phoneNumber: config.phoneNumber,
    }),
  };
  if (!payload.statusCallback) {
    delete payload.statusCallback;
  }

  return payload;
}

/**
 * Trial Create Message needs the Console-assigned trial From number.
 * Without it Twilio returns 572003 for verified recipients.
 */
export function assertTrialFromConfigured(
  config: Pick<OutboundBodyConfig, "mode" | "phoneNumber">
): { ok: true } | { ok: false; code: "MISSING_TRIAL_FROM"; message: string } {
  if (config.mode !== "trial") return { ok: true };
  if (config.phoneNumber?.trim()) return { ok: true };
  return {
    ok: false,
    code: "MISSING_TRIAL_FROM",
    message: MISSING_TRIAL_FROM_DIAGNOSTIC,
  };
}
