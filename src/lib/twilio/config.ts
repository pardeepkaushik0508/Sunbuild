import "server-only";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/db";
import { maskPhone, maskSid } from "@/lib/twilio/phone";
import { getTwilioWebhookUrls } from "@/lib/twilio/webhooks";
import {
  getTwilioSenderMode,
  normalizeTwilioAccountSid,
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
  /** Live Twilio API auth succeeded with current env. */
  liveAuthOk: boolean | null;
  /** TWILIO_PHONE_NUMBER exists on this Twilio account (Incoming Numbers). */
  fromNumberOwned: boolean | null;
  statusCallbackUrl: string;
  inboundWebhookUrl: string;
  recentFailures: TwilioFailureSample[];
  diagnostics: string[];
};

export function getTwilioConfig(): TwilioConfig | null {
  const rawSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const accountSid = rawSid ? normalizeTwilioAccountSid(rawSid) : "";
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const messagingServiceSid =
    process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() || null;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER?.trim() || null;
  const senderMode = getTwilioSenderMode();

  if (!accountSid || !authToken || senderMode === "not_configured") {
    return null;
  }

  if (rawSid && rawSid !== accountSid) {
    console.warn(
      "[twilio] TWILIO_ACCOUNT_SID looked duplicated; using the first AC…32hex value. Fix Render/.env.local to the single SID."
    );
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
  recentFailures: TwilioFailureSample[],
  live?: {
    liveAuthOk: boolean | null;
    fromNumberOwned: boolean | null;
    phoneNumber: string | null;
  }
): string[] {
  const lines: string[] = [];
  if (senderMode === "not_configured") {
    lines.push(
      "SMS is NOT_CONFIGURED. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER for trial, or TWILIO_MESSAGING_SERVICE_SID for production."
    );
    return lines;
  }

  if (live?.liveAuthOk === false) {
    lines.push(
      "Live Twilio login failed (20003). On Render, set TWILIO_ACCOUNT_SID to a single AC… value (34 characters, not pasted twice) and the matching TWILIO_AUTH_TOKEN, then redeploy."
    );
  } else if (live?.liveAuthOk === true) {
    lines.push("Live Twilio authentication is OK with the current Account SID + Auth Token.");
  }

  if (senderMode === "phone_number") {
    lines.push(
      "Sending with TWILIO_PHONE_NUMBER (direct From). This must be a number from Twilio Console → Phone Numbers → Manage, not the subcontractor’s personal mobile."
    );
  } else {
    lines.push(
      "Sending with TWILIO_MESSAGING_SERVICE_SID. Direct TWILIO_PHONE_NUMBER is unused while the Messaging Service is set."
    );
  }

  if (live?.fromNumberOwned === false && senderMode === "phone_number") {
    lines.push(
      "BLOCKER: TWILIO_PHONE_NUMBER is not on this Twilio account (no Incoming Phone Numbers match). Open Twilio Console → Phone Numbers → Buy a number, then set that exact number as TWILIO_PHONE_NUMBER on Render and .env.local, then redeploy."
    );
  } else if (live?.fromNumberOwned === true) {
    lines.push("TWILIO_PHONE_NUMBER is present on this Twilio account.");
  }

  if (live?.phoneNumber?.startsWith("+91")) {
    lines.push(
      "India (+91) destinations on trial often require approved SMS templates (error 572006). Prefer a Twilio US/CA number as From, verify the recipient under Verified Caller IDs, or upgrade/register templates."
    );
  }

  lines.push(
    "Twilio trial accounts can only SMS verified numbers. Unverified recipients are stored as FAILED; project/task actions still succeed."
  );

  if (recentFailures.some((f) => f.errorCode === "20003") && live?.liveAuthOk !== true) {
    lines.push(
      "A stored SMS failed with Authentication Error 20003. Fix TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN on Render and redeploy."
    );
  }
  if (
    recentFailures.some(
      (f) =>
        f.errorCode === "21212" ||
        f.errorCode === "21606" ||
        /TWILIO_PHONE_NUMBER must be a Twilio Console phone number/i.test(
          f.errorMessage || ""
        ) ||
        /not a valid|not a twilio|from phone number/i.test(f.errorMessage || "")
    )
  ) {
    lines.push(
      "A stored SMS failed because the From number is invalid. Buy a Twilio number and update TWILIO_PHONE_NUMBER."
    );
  }
  if (
    recentFailures.some(
      (f) =>
        f.errorCode === "572006" ||
        /approved SMS template|predefined SMS templates/i.test(
          f.errorMessage || ""
        )
    )
  ) {
    lines.push(
      "A stored SMS failed with India/template trial rules (572006). Get a Twilio From number, verify the recipient, or use approved templates."
    );
  }
  if (recentFailures.some((f) => f.unverifiedRecipient)) {
    lines.push(
      "A stored SMS was rejected because the recipient is not verified. Verify the number in Twilio Console → Verified Caller IDs, or upgrade the account."
    );
  }
  return lines;
}

async function probeTwilioAccount(config: TwilioConfig): Promise<{
  liveAuthOk: boolean;
  fromNumberOwned: boolean | null;
}> {
  try {
    const twilio = (await import("twilio")).default;
    const client = twilio(config.accountSid, config.authToken);
    await client.api.accounts(config.accountSid).fetch();

    if (config.senderMode === "messaging_service") {
      return { liveAuthOk: true, fromNumberOwned: null };
    }

    const phone = config.phoneNumber?.trim() || "";
    if (!phone) return { liveAuthOk: true, fromNumberOwned: false };

    const owned = await client.incomingPhoneNumbers.list({
      phoneNumber: phone,
      limit: 5,
    });
    if (owned.length > 0) {
      return { liveAuthOk: true, fromNumberOwned: true };
    }

    // Some accounts store formatting differently — fall back to a short list compare.
    const all = await client.incomingPhoneNumbers.list({ limit: 50 });
    const digits = phone.replace(/\D/g, "");
    const match = all.some(
      (n) => (n.phoneNumber || "").replace(/\D/g, "") === digits
    );
    return { liveAuthOk: true, fromNumberOwned: match };
  } catch (err) {
    console.warn("[twilio] live account probe failed", {
      message: err instanceof Error ? err.message : "unknown",
      code:
        err && typeof err === "object" && "code" in err
          ? (err as { code?: unknown }).code
          : null,
    });
    return { liveAuthOk: false, fromNumberOwned: null };
  }
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
      liveAuthOk: null,
      fromNumberOwned: null,
      statusCallbackUrl: webhooks.status,
      inboundWebhookUrl: webhooks.inbound,
      recentFailures,
      diagnostics: diagnosticsFor(senderMode, recentFailures),
    };
  }

  const live = await probeTwilioAccount(config);
  const sendReady =
    live.liveAuthOk &&
    (config.senderMode === "messaging_service" || live.fromNumberOwned === true);

  return {
    status: sendReady ? "connected" : "setup_required",
    provider: "twilio",
    senderMode,
    fromDisplay:
      senderMode === "messaging_service"
        ? maskSid(config.messagingServiceSid)
        : maskPhone(config.phoneNumber),
    messagingServiceConfigured: senderMode === "messaging_service",
    liveAuthOk: live.liveAuthOk,
    fromNumberOwned: live.fromNumberOwned,
    statusCallbackUrl: webhooks.status,
    inboundWebhookUrl: webhooks.inbound,
    recentFailures,
    diagnostics: diagnosticsFor(senderMode, recentFailures, {
      liveAuthOk: live.liveAuthOk,
      fromNumberOwned: live.fromNumberOwned,
      phoneNumber: config.phoneNumber,
    }),
  };
}
