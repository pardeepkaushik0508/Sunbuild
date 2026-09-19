import { stripWhatsAppPrefix, toWhatsAppAddress } from "@/lib/twilio/phone";

export type TwilioWhatsAppPayloadConfig = {
  from: string;
};

export type TwilioWhatsAppSendFields = {
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
  statusCallback?: string;
};

export function buildTwilioWhatsAppPayload(
  config: TwilioWhatsAppPayloadConfig,
  input: TwilioWhatsAppSendFields
): Record<string, unknown> {
  const fromNumber = stripWhatsAppPrefix(config.from);
  const toNumber = stripWhatsAppPrefix(input.to);
  const payload: Record<string, unknown> = {
    from: toWhatsAppAddress(fromNumber),
    to: toWhatsAppAddress(toNumber),
  };
  if (input.statusCallback) payload.statusCallback = input.statusCallback;
  if (input.contentSid) {
    payload.contentSid = input.contentSid;
    if (input.contentVariables && Object.keys(input.contentVariables).length) {
      payload.contentVariables = JSON.stringify(input.contentVariables);
    }
  } else if (input.body) {
    payload.body = input.body;
  }
  return payload;
}
