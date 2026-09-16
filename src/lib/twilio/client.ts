import "server-only";

import twilio from "twilio";
import { validateRequest } from "twilio/lib/webhooks/webhooks";
import type { TwilioConfig } from "@/lib/twilio/config";
import { parseTwilioSendError } from "@/lib/twilio/errors";
import {
  buildTwilioMessagePayload,
  type TwilioMessagePayload,
} from "@/lib/twilio/payload";

export type { TwilioMessagePayload };
export { buildTwilioMessagePayload };

export type TwilioSendResult = {
  sid: string | null;
  status: string;
  from: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  unverifiedRecipient: boolean;
  authFailed: boolean;
  trialRestriction: boolean;
};

function getClient(config: TwilioConfig) {
  return twilio(config.accountSid, config.authToken);
}

export async function sendTwilioSms(
  config: TwilioConfig,
  input: {
    to: string;
    body: string;
    statusCallback: string;
  }
): Promise<TwilioSendResult> {
  const client = getClient(config);
  const payload = buildTwilioMessagePayload(config, input);

  try {
    const message = await client.messages.create(payload);
    const failed =
      String(message.status || "").toLowerCase() === "failed" ||
      String(message.status || "").toLowerCase() === "undelivered";
    const parsedFailure = failed
      ? parseTwilioSendError({
          code: message.errorCode,
          message: message.errorMessage,
        })
      : null;
    return {
      sid: message.sid,
      status: message.status,
      from: message.from || config.phoneNumber,
      errorCode: message.errorCode != null ? String(message.errorCode) : null,
      errorMessage: message.errorMessage || null,
      unverifiedRecipient: parsedFailure?.unverifiedRecipient ?? false,
      authFailed: parsedFailure?.authFailed ?? false,
      trialRestriction: parsedFailure?.trialRestriction ?? false,
    };
  } catch (err) {
    const parsed = parseTwilioSendError(err);
    return {
      sid: null,
      status: "failed",
      from: config.phoneNumber,
      errorCode: parsed.errorCode,
      errorMessage: parsed.errorMessage,
      unverifiedRecipient: parsed.unverifiedRecipient,
      authFailed: parsed.authFailed,
      trialRestriction: parsed.trialRestriction,
    };
  }
}

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return validateRequest(authToken, signature, url, params);
}
