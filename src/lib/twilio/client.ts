import "server-only";

import twilio from "twilio";
import { validateRequest } from "twilio/lib/webhooks/webhooks";
import type { Twilio } from "twilio";
import type { TwilioConfig } from "@/lib/twilio/config";
import { getTwilioAuthConfig, type TwilioWhatsAppConfig } from "@/lib/twilio/config";
import { parseTwilioSendError } from "@/lib/twilio/errors";
import {
  buildTwilioMessagePayload,
  type TwilioMessagePayload,
} from "@/lib/twilio/payload";
import { buildTwilioWhatsAppPayload } from "@/lib/twilio/whatsapp-payload";
import { toWhatsAppAddress } from "@/lib/twilio/phone";

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
  optedOut: boolean;
  sandboxNotJoined: boolean;
  outsideSessionWindow: boolean;
  retryable: boolean;
  permanent: boolean;
};

export type TwilioMessagesCreate = (payload: Record<string, unknown>) => Promise<{
  sid?: string | null;
  status?: string | null;
  from?: string | null;
  errorCode?: number | string | null;
  errorMessage?: string | null;
}>;

let cachedClient: Twilio | null = null;
let cachedAccountSid = "";

function emptyResult(
  from: string | null,
  parsed: ReturnType<typeof parseTwilioSendError>
): TwilioSendResult {
  return {
    sid: null,
    status: "failed",
    from,
    errorCode: parsed.errorCode,
    errorMessage: parsed.errorMessage,
    unverifiedRecipient: parsed.unverifiedRecipient,
    authFailed: parsed.authFailed,
    trialRestriction: parsed.trialRestriction,
    optedOut: parsed.optedOut,
    sandboxNotJoined: parsed.sandboxNotJoined,
    outsideSessionWindow: parsed.outsideSessionWindow,
    retryable: parsed.retryable,
    permanent: parsed.permanent,
  };
}

function mapCreateResult(
  message: {
    sid?: string | null;
    status?: string | null;
    from?: string | null;
    errorCode?: number | string | null;
    errorMessage?: string | null;
  },
  fallbackFrom: string | null
): TwilioSendResult {
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
    sid: message.sid ?? null,
    status: message.status || "queued",
    from: message.from || fallbackFrom,
    errorCode:
      message.errorCode != null ? String(message.errorCode) : null,
    errorMessage: message.errorMessage || null,
    unverifiedRecipient: parsedFailure?.unverifiedRecipient ?? false,
    authFailed: parsedFailure?.authFailed ?? false,
    trialRestriction: parsedFailure?.trialRestriction ?? false,
    optedOut: parsedFailure?.optedOut ?? false,
    sandboxNotJoined: parsedFailure?.sandboxNotJoined ?? false,
    outsideSessionWindow: parsedFailure?.outsideSessionWindow ?? false,
    retryable: parsedFailure?.retryable ?? false,
    permanent: parsedFailure?.permanent ?? false,
  };
}

/** One server-only Twilio REST client. Never instantiate in route files. */
export function getTwilioRestClient(): Twilio | null {
  const auth = getTwilioAuthConfig();
  if (!auth) {
    cachedClient = null;
    cachedAccountSid = "";
    return null;
  }
  if (!cachedClient || cachedAccountSid !== auth.accountSid) {
    cachedClient = twilio(auth.accountSid, auth.authToken);
    cachedAccountSid = auth.accountSid;
  }
  return cachedClient;
}

function getClient(config: TwilioConfig) {
  const existing = getTwilioRestClient();
  if (existing) return existing;
  return twilio(config.accountSid, config.authToken);
}

export async function sendTwilioSms(
  config: TwilioConfig,
  input: {
    to: string;
    body: string;
    statusCallback?: string;
  },
  messagesCreate?: TwilioMessagesCreate
): Promise<TwilioSendResult> {
  const payload = buildTwilioMessagePayload(config, {
    to: input.to,
    body: input.body,
    statusCallback: input.statusCallback || "",
  });
  const createPayload: Record<string, unknown> = { ...payload };
  if (!input.statusCallback) delete createPayload.statusCallback;

  try {
    const create =
      messagesCreate ||
      ((body: Record<string, unknown>) =>
        getClient(config).messages.create(
          body as unknown as Parameters<Twilio["messages"]["create"]>[0]
        ));
    const message = await create(createPayload);
    return mapCreateResult(message, config.phoneNumber);
  } catch (err) {
    return emptyResult(config.phoneNumber, parseTwilioSendError(err));
  }
}

export type TwilioWhatsAppSendInput = {
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
  statusCallback?: string;
};

export { buildTwilioWhatsAppPayload } from "@/lib/twilio/whatsapp-payload";

export async function sendTwilioWhatsAppMessage(
  config: TwilioWhatsAppConfig,
  input: TwilioWhatsAppSendInput,
  messagesCreate?: TwilioMessagesCreate
): Promise<TwilioSendResult> {
  const payload = buildTwilioWhatsAppPayload(config, input);
  try {
    const rest = getTwilioRestClient();
    const create =
      messagesCreate ||
      ((body: Record<string, unknown>) => {
        if (!rest) {
          throw new Error("Twilio client is not configured");
        }
        return rest.messages.create(
          body as unknown as Parameters<Twilio["messages"]["create"]>[0]
        );
      });
    const message = await create(payload);
    return mapCreateResult(message, toWhatsAppAddress(config.from));
  } catch (err) {
    return emptyResult(toWhatsAppAddress(config.from), parseTwilioSendError(err));
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
