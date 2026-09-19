import "server-only";

import { resolveWhatsAppProviderName } from "@/lib/messaging/provider-select";
import {
  getTwilioConfig,
  getTwilioWhatsAppConfig,
  isTwilioSmsConfigured,
  isTwilioWhatsAppConfigured,
} from "@/lib/twilio/config";
import {
  sendTwilioSms,
  sendTwilioWhatsAppMessage,
} from "@/lib/twilio/client";
import type {
  ProviderSendResult,
  SmsProvider,
  SmsSendInput,
  WhatsAppProvider,
  WhatsAppSendInput,
} from "@/lib/messaging/types";

function twilioResult(
  sent: Awaited<ReturnType<typeof sendTwilioSms>>
): ProviderSendResult {
  const failed = !sent.sid || sent.status === "failed";
  return {
    ok: !failed,
    provider: "TWILIO",
    sid: sent.sid,
    status: sent.status,
    from: sent.from,
    errorCode: sent.errorCode,
    errorMessage: sent.errorMessage,
    unverifiedRecipient: sent.unverifiedRecipient,
    optedOut: sent.optedOut,
    sandboxNotJoined: sent.sandboxNotJoined,
    outsideSessionWindow: sent.outsideSessionWindow,
    retryable: sent.retryable,
    permanent: sent.permanent,
  };
}

export class TwilioSmsProvider implements SmsProvider {
  readonly name = "TWILIO" as const;

  isConfigured(): boolean {
    return isTwilioSmsConfigured();
  }

  async send(input: SmsSendInput): Promise<ProviderSendResult> {
    const config = getTwilioConfig();
    if (!config) {
      return {
        ok: false,
        provider: "TWILIO",
        sid: null,
        status: "not_configured",
        from: null,
        errorCode: "NOT_CONFIGURED",
        errorMessage: "Twilio SMS is not configured.",
        permanent: true,
      };
    }
    return twilioResult(
      await sendTwilioSms(config, {
        to: input.to,
        body: input.body,
        contentSid: input.contentSid,
        contentVariables: input.contentVariables,
        statusCallback: input.statusCallback,
      })
    );
  }
}

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = "TWILIO" as const;

  isConfigured(): boolean {
    return isTwilioWhatsAppConfigured();
  }

  async sendTemplate(input: WhatsAppSendInput): Promise<ProviderSendResult> {
    return this.send(input);
  }

  async sendFreeform(input: WhatsAppSendInput): Promise<ProviderSendResult> {
    return this.send({ ...input, contentSid: undefined, contentVariables: undefined });
  }

  private async send(input: WhatsAppSendInput): Promise<ProviderSendResult> {
    const config = getTwilioWhatsAppConfig();
    if (!config) {
      return {
        ok: false,
        provider: "TWILIO",
        sid: null,
        status: "not_configured",
        from: null,
        errorCode: "NOT_CONFIGURED",
        errorMessage: "Twilio WhatsApp is not configured.",
        permanent: true,
      };
    }
    return twilioResult(
      await sendTwilioWhatsAppMessage(config, {
        to: input.to,
        body: input.body,
        contentSid: input.contentSid,
        contentVariables: input.contentVariables,
        statusCallback: input.statusCallback,
      })
    );
  }
}

export function getSmsProvider(): SmsProvider | null {
  const provider = new TwilioSmsProvider();
  return provider.isConfigured() ? provider : null;
}

export function getWhatsAppProvider(): WhatsAppProvider | null {
  const name = resolveWhatsAppProviderName();
  if (name === "twilio") return new TwilioWhatsAppProvider();
  return null;
}

export function isAutomatedWhatsAppTwilio(): boolean {
  return resolveWhatsAppProviderName() === "twilio";
}
