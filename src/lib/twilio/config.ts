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
import {
  getTwilioMode,
  maskAccountSid,
  resolveTwilioTrialTemplate,
  type TwilioMode,
} from "@/lib/twilio/mode";

export type TwilioConfig = {
  mode: TwilioMode;
  accountSid: string;
  authToken: string;
  messagingServiceSid: string | null;
  phoneNumber: string | null;
  senderMode: Exclude<TwilioSenderMode, "not_configured">;
  trialTemplate: string | null;
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
  mode: TwilioMode;
  senderMode: TwilioSenderMode;
  fromDisplay: string | null;
  accountSidDisplay: string | null;
  authTokenConfigured: boolean;
  trialTemplate: string | null;
  messagingServiceConfigured: boolean;
  /** Live Twilio API auth succeeded with current env. */
  liveAuthOk: boolean | null;
  /** TWILIO_PHONE_NUMBER exists on this Twilio account (Incoming Numbers). Production only. */
  fromNumberOwned: boolean | null;
  /** Trial readiness: auth OK + valid template (From not required). */
  trialReady: boolean | null;
  statusCallbackUrl: string;
  inboundWebhookUrl: string;
  recentFailures: TwilioFailureSample[];
  diagnostics: string[];
};

export function getTwilioConfig(): TwilioConfig | null {
  const mode = getTwilioMode();
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

  let trialTemplate: string | null = null;
  if (mode === "trial") {
    const resolved = resolveTwilioTrialTemplate();
    trialTemplate = resolved.ok ? resolved.template : null;
  }

  return {
    mode,
    accountSid,
    authToken,
    messagingServiceSid,
    phoneNumber,
    senderMode,
    trialTemplate,
  };
}

export function isTwilioConfigured(): boolean {
  return getTwilioConfig() !== null;
}

export function requireTwilioConfig(): TwilioConfig {
  const config = getTwilioConfig();
  if (!config) {
    const mode = getTwilioMode();
    throw new AppError(
      mode === "trial"
        ? "SMS is not configured. For trial set TWILIO_MODE=trial, TWILIO_ACCOUNT_SID, and TWILIO_AUTH_TOKEN (TWILIO_PHONE_NUMBER is not required)."
        : "SMS is not configured. For production set TWILIO_MODE=production, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER (or TWILIO_MESSAGING_SERVICE_SID).",
      503,
      "TWILIO_CONFIG"
    );
  }
  return config;
}

function diagnosticsFor(
  mode: TwilioMode,
  senderMode: TwilioSenderMode,
  recentFailures: TwilioFailureSample[],
  live?: {
    liveAuthOk: boolean | null;
    fromNumberOwned: boolean | null;
    phoneNumber: string | null;
    trialTemplate: string | null;
    accountSidDisplay: string | null;
    authTokenConfigured: boolean;
    statusCallbackUrl: string;
  }
): string[] {
  const lines: string[] = [];

  lines.push(`Twilio mode: ${mode.toUpperCase()}`);

  if (senderMode === "not_configured") {
    if (mode === "trial") {
      lines.push(
        "SMS is NOT_CONFIGURED. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN. TWILIO_PHONE_NUMBER is not required in trial."
      );
    } else {
      lines.push(
        "SMS is NOT_CONFIGURED. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER (or TWILIO_MESSAGING_SERVICE_SID)."
      );
    }
    return lines;
  }

  if (live?.accountSidDisplay) {
    lines.push(`Account SID: ${live.accountSidDisplay}`);
  }
  lines.push(
    `Auth Token: ${live?.authTokenConfigured ? "configured" : "missing"}`
  );

  if (live?.liveAuthOk === false) {
    lines.push(
      "Authentication: FAILED (TWILIO_AUTH_FAILED / 20003). On Render, set TWILIO_ACCOUNT_SID to a single AC… value and the matching TWILIO_AUTH_TOKEN, then redeploy. Never paste the token into the UI."
    );
  } else if (live?.liveAuthOk === true) {
    lines.push("Authentication: OK");
  } else {
    lines.push("Authentication: Not checked");
  }

  if (mode === "trial") {
    const resolved = resolveTwilioTrialTemplate();
    if (!resolved.ok) {
      lines.push(
        `Trial template: INVALID (${resolved.raw}) — fix TWILIO_TRIAL_TEMPLATE`
      );
    } else {
      lines.push(
        `Trial template: ${live?.trialTemplate || resolved.template}`
      );
    }
    lines.push("Purchased From number: Not required in trial");
    lines.push(
      "Recipient verification: Cannot reliably confirm locally; verify recipient in Twilio Console → Messaging → Try out SMS"
    );
    if (live?.statusCallbackUrl) {
      lines.push(`Status callback: ${live.statusCallbackUrl}`);
    }
    const trialReady = live?.liveAuthOk === true && resolved.ok;
    lines.push(`Ready for trial API test: ${trialReady ? "YES" : "NO"}`);
    lines.push(
      "Trial SMS body is a Twilio template id (not custom CRM text). Intended notification text is still stored in SMS history."
    );
    return lines;
  }

  // Production diagnostics
  if (senderMode === "phone_number") {
    lines.push(
      "Sending with TWILIO_PHONE_NUMBER (direct From). This must be a number from Twilio Console → Phone Numbers → Manage."
    );
  } else if (senderMode === "messaging_service") {
    lines.push(
      "Sending with TWILIO_MESSAGING_SERVICE_SID. Direct TWILIO_PHONE_NUMBER is unused while the Messaging Service is set."
    );
  }

  if (live?.fromNumberOwned === false && senderMode === "phone_number") {
    lines.push(
      "BLOCKER: TWILIO_PHONE_NUMBER is not on this Twilio account (no Incoming Phone Numbers match). Open Twilio Console → Phone Numbers, then set that exact number as TWILIO_PHONE_NUMBER on Render and .env.local, then redeploy."
    );
  } else if (live?.fromNumberOwned === true) {
    lines.push("From number on Twilio account: YES");
  }

  if (
    recentFailures.some((f) => f.errorCode === "20003") &&
    live?.liveAuthOk !== true
  ) {
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
        /not a valid|not a twilio|from phone number/i.test(
          f.errorMessage || ""
        )
    )
  ) {
    lines.push(
      "A stored SMS failed because the From number is invalid. Update TWILIO_PHONE_NUMBER to a number owned by this Twilio account."
    );
  }
  if (
    recentFailures.some(
      (f) =>
        /not supported by the current Twilio trial|Try out SMS/i.test(
          f.errorMessage || ""
        ) ||
        f.errorCode === "21408" ||
        f.errorCode === "21612"
    )
  ) {
    lines.push(
      "A stored SMS failed due to trial recipient/geographic restrictions. Verify an allowed destination in Twilio Console → Messaging → Try out SMS (do not buy a number solely for this)."
    );
  }
  if (recentFailures.some((f) => f.unverifiedRecipient)) {
    lines.push(
      "A stored SMS was rejected because the recipient is not verified. Verify the number in Twilio Console, or upgrade the account."
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

    // Trial: never require IncomingPhoneNumbers ownership.
    if (config.mode === "trial") {
      return { liveAuthOk: true, fromNumberOwned: null };
    }

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
  const mode = getTwilioMode();
  const trialResolved = resolveTwilioTrialTemplate();
  const trialTemplate = trialResolved.ok ? trialResolved.template : null;

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

  const baseDiagLive = {
    liveAuthOk: null as boolean | null,
    fromNumberOwned: null as boolean | null,
    phoneNumber: config?.phoneNumber ?? null,
    trialTemplate,
    accountSidDisplay: config ? maskAccountSid(config.accountSid) : null,
    authTokenConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
    statusCallbackUrl: webhooks.status,
  };

  if (!config) {
    return {
      status: "setup_required",
      provider: null,
      mode,
      senderMode,
      fromDisplay: null,
      accountSidDisplay: null,
      authTokenConfigured: Boolean(process.env.TWILIO_AUTH_TOKEN?.trim()),
      trialTemplate: mode === "trial" ? trialTemplate : null,
      messagingServiceConfigured: false,
      liveAuthOk: null,
      fromNumberOwned: null,
      trialReady: null,
      statusCallbackUrl: webhooks.status,
      inboundWebhookUrl: webhooks.inbound,
      recentFailures,
      diagnostics: diagnosticsFor(mode, senderMode, recentFailures, baseDiagLive),
    };
  }

  const live = await probeTwilioAccount(config);
  const templateOk = mode !== "trial" || trialResolved.ok;
  const trialReady =
    mode === "trial" ? live.liveAuthOk && templateOk : null;
  const sendReady =
    mode === "trial"
      ? Boolean(trialReady)
      : live.liveAuthOk &&
        (config.senderMode === "messaging_service" ||
          live.fromNumberOwned === true);

  return {
    status: sendReady ? "connected" : "setup_required",
    provider: "twilio",
    mode,
    senderMode,
    fromDisplay:
      mode === "trial"
        ? "Not required in trial"
        : senderMode === "messaging_service"
          ? maskSid(config.messagingServiceSid)
          : maskPhone(config.phoneNumber),
    accountSidDisplay: maskAccountSid(config.accountSid),
    authTokenConfigured: true,
    trialTemplate: mode === "trial" ? trialTemplate : null,
    messagingServiceConfigured: senderMode === "messaging_service",
    liveAuthOk: live.liveAuthOk,
    fromNumberOwned: live.fromNumberOwned,
    trialReady,
    statusCallbackUrl: webhooks.status,
    inboundWebhookUrl: webhooks.inbound,
    recentFailures,
    diagnostics: diagnosticsFor(mode, senderMode, recentFailures, {
      liveAuthOk: live.liveAuthOk,
      fromNumberOwned: live.fromNumberOwned,
      phoneNumber: config.phoneNumber,
      trialTemplate,
      accountSidDisplay: maskAccountSid(config.accountSid),
      authTokenConfigured: true,
      statusCallbackUrl: webhooks.status,
    }),
  };
}
