import "server-only";

import twilio from "twilio";
import { validateRequest } from "twilio/lib/webhooks/webhooks";
import type { TwilioConfig } from "@/lib/twilio/config";
import { parseTwilioSendError } from "@/lib/twilio/errors";
import { selectTwilioFromFields } from "@/lib/twilio/sender";

export type TwilioSendResult = {
  sid: string | null;
  status: string;
  from: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  unverifiedRecipient: boolean;
};

function getClient(config: TwilioConfig) {
  return twilio(config.accountSid, config.authToken);
}

/**
 * Build the Twilio Messages.create payload.
 * Messaging Service wins when present; otherwise send From the trial number.
 */
export function buildTwilioMessagePayload(
  config: TwilioConfig,
  input: { to: string; body: string; statusCallback: string }
): {
  to: string;
  body: string;
  statusCallback: string;
  messagingServiceSid?: string;
  from?: string;
} {
  const payload: {
    to: string;
    body: string;
    statusCallback: string;
    messagingServiceSid?: string;
    from?: string;
  } = {
    to: input.to,
    body: input.body,
    statusCallback: input.statusCallback,
    ...selectTwilioFromFields({
      messagingServiceSid: config.messagingServiceSid,
      phoneNumber: config.phoneNumber,
    }),
  };

  return payload;
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
    return {
      sid: message.sid,
      status: message.status,
      from: message.from || config.phoneNumber,
      errorCode: message.errorCode != null ? String(message.errorCode) : null,
      errorMessage: message.errorMessage || null,
      unverifiedRecipient: failed
        ? parseTwilioSendError({
            code: message.errorCode,
            message: message.errorMessage,
          }).unverifiedRecipient
        : false,
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
