import "server-only";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { maskPhone, maskSid } from "@/lib/twilio/phone";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import {
  getTwilioSenderMode,
  type TwilioSenderMode,
} from "@/lib/twilio/sender";
import { isUnverifiedRecipientRecord } from "@/lib/twilio/errors";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  messagingServiceSid: string | null;
  phoneNumber: string | null;
  senderMode: Exclude<TwilioSenderMode, "not_configured">;
};

export type TwilioFailureSample = {
  sentAt: string;
  toDisplay: string;
  errorCode: string | null;
  errorMessage: string | null;
  unverifiedRecipient: boolean;
};

export type PublicTwilioSettings = {
  status: "connected" | "setup_required";
  provider: "twilio" | null;
  senderMode: TwilioSenderMode;
  fromDisplay: string | null;
  messagingServiceConfigured: boolean;
  statusCallbackUrl: string;
  inboundWebhookUrl: string;
  recentFailures: TwilioFailureSample[];
  diagnostics: string[];
};

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim() || null;
  const senderMode = getTwilioSenderMode();

  if (!accountSid || !authToken || senderMode === "not_configured") {
    return null;
  }

  return {
    accountSid,
    authToken,
    messagingServiceSid,
    phoneNumber,
    senderMode,
  };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null;
}

export function requireTwilioConfig(): TwilioConfig {
  const config = getTwilioConfig();
  if (!config) {
    throw new AppError(
      "SMS is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER (trial) or TWILIO_MESSAGING_SERVICE_SID (production).",
      503,
      "TWILIO_CONFIG"
    );
  }
  return config;
}

function diagnosticsFor(
  senderMode: TwilioSenderMode,
  recentFailures: TwilioFailureSample[]
): string[] {
  const lines: string[] = [];
  if (senderMode === "not_configured") {
    lines.push(
      "SMS is NOT_CONFIGURED. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER for trial, or TWILIO_MESSAGING_SERVICE_SID for production."
    );
    return lines;
  }
  if (senderMode === "phone_number") {
    lines.push(
      "Sending with TWILIO_PHONE_NUMBER (direct From). Add TWILIO_MESSAGING_SERVICE_SID later to switch to a Messaging Service without changing CRM notification flows."
    );
  } else {
    lines.push(
      "Sending with TWILIO_MESSAGING_SERVICE_SID. Direct TWILIO_PHONE_NUMBER is unused while the Messaging Service is set."
    );
  }
  lines.push(
    "Twilio trial accounts can only SMS verified numbers. Unverified recipients are stored as FAILED; project, task, RFI, payment, and warranty actions still succeed."
  );
  if (recentFailures.some((f) => f.unverifiedRecipient)) {
    lines.push(
      "A recent SMS was rejected because the recipient is not verified. Verify the number in Twilio or upgrade the account."
    );
  }
  return lines;
}

/** Public, non-secret snapshot for Owner settings. Never includes tokens. */
export async function getPublicTwilioSettings(
  request?: Request
): Promise<PublicTwilioSettings> {
  const config = getTwilioConfig();
  const webhooks = getTwilioWebhookUrls(request);
  const senderMode = getTwilioSenderMode();

  const failedRows = await prisma.smsMessage
    .findMany({
      where: { status: "FAILED", direction: "OUTBOUND" },
      orderBy: { sentAt: "desc" },
      take: 8,
      select: {
        sentAt: true,
        toNumber: true,
        errorCode: true,
        errorMessage: true,
      },
    })
    .catch((error) => {
      console.warn("[twilio] failed to load recent SMS failures", error);
      return [];
    });

  const recentFailures: TwilioFailureSample[] = failedRows.map((row) => ({
    sentAt: row.sentAt.toISOString(),
    toDisplay: maskPhone(row.toNumber) || "••••",
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    unverifiedRecipient: isUnverifiedRecipientRecord(
      row.errorCode,
      row.errorMessage
    ),
  }));

  if (!config) {
    return {
      status: "setup_required",
      provider: null,
      senderMode,
      fromDisplay: null,
      messagingServiceConfigured: false,
      statusCallbackUrl: webhooks.status,
      inboundWebhookUrl: webhooks.inbound,
      recentFailures,
      diagnostics: diagnosticsFor(senderMode, recentFailures),
    };
  }

  return {
    status: "connected",
    provider: "twilio",
    senderMode,
    fromDisplay:
      senderMode === "messaging_service"
        ? maskSid(config.messagingServiceSid)
        : maskPhone(config.phoneNumber),
    messagingServiceConfigured: senderMode === "messaging_service",
    statusCallbackUrl: webhooks.status,
    inboundWebhookUrl: webhooks.inbound,
    recentFailures,
    diagnostics: diagnosticsFor(senderMode, recentFailures),
  };
}
