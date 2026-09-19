import type { CommunicationChannel, CommunicationProvider } from "@prisma/client";

export type MessagingChannel = "SMS" | "WHATSAPP";

export type SmsSendInput = {
  to: string;
  /** Body-based send (Trial template id or production custom text). */
  body?: string;
  /** Optional Twilio Content Template (production CONTENT_TEMPLATE mode). */
  contentSid?: string;
  contentVariables?: Record<string, string>;
  statusCallback?: string;
};

export type WhatsAppSendInput = {
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
  statusCallback?: string;
};

export type ProviderSendResult = {
  ok: boolean;
  provider: CommunicationProvider;
  sid: string | null;
  status: string;
  from: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  unverifiedRecipient?: boolean;
  optedOut?: boolean;
  sandboxNotJoined?: boolean;
  outsideSessionWindow?: boolean;
  retryable?: boolean;
  permanent?: boolean;
};

export interface SmsProvider {
  readonly name: CommunicationProvider;
  isConfigured(): boolean;
  send(input: SmsSendInput): Promise<ProviderSendResult>;
}

export interface WhatsAppProvider {
  readonly name: CommunicationProvider;
  isConfigured(): boolean;
  sendTemplate(input: WhatsAppSendInput): Promise<ProviderSendResult>;
  sendFreeform(input: WhatsAppSendInput): Promise<ProviderSendResult>;
}

export type ChannelSendRequest = {
  channel: CommunicationChannel;
  to: string;
  body?: string;
  contentSid?: string;
  contentVariables?: Record<string, string>;
  statusCallback?: string;
};
