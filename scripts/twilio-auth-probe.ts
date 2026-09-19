/**
 * Live Twilio auth probe only — no SMS/WhatsApp send.
 * Avoids importing server-only modules. Never prints secrets.
 */
import fs from "node:fs";
import path from "node:path";
import twilio from "twilio";

function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

function firstAcSid(raw: string | undefined): string {
  const v = (raw || "").trim();
  const m = v.match(/AC[0-9a-fA-F]{32}/);
  return m ? m[0] : v;
}

async function main() {
  loadEnvLocal();
  const accountSid = firstAcSid(process.env.TWILIO_ACCOUNT_SID);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const mode = (process.env.TWILIO_MODE || "trial").trim().toLowerCase();
  const appUrl = (process.env.APP_URL || "").trim();
  const publicCallbacks =
    /^https:\/\//i.test(appUrl) &&
    !/localhost|127\.0\.0\.1/i.test(appUrl);

  console.log({
    trialMode: mode !== "production",
    smsConfigured: Boolean(
      accountSid &&
        authToken &&
        (process.env.TWILIO_PHONE_NUMBER?.trim() ||
          process.env.TWILIO_MESSAGING_SERVICE_SID?.trim() ||
          mode !== "production")
    ),
    whatsappConfigured: Boolean(
      accountSid && authToken && process.env.TWILIO_WHATSAPP_FROM?.trim()
    ),
    messagingServiceSid: Boolean(
      process.env.TWILIO_MESSAGING_SERVICE_SID?.trim()
    ),
    publicCallbacks,
    whatsappTestContentSid: Boolean(
      process.env.TWILIO_WHATSAPP_TEST_CONTENT_SID?.trim()
    ),
    phoneNumberSet: Boolean(process.env.TWILIO_PHONE_NUMBER?.trim()),
    trialTemplateSet: Boolean(process.env.TWILIO_TRIAL_TEMPLATE?.trim()),
  });

  if (!accountSid || !authToken) {
    console.log("LIVE_AUTH: NOT_CONFIGURED");
    return;
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.api.accounts(accountSid).fetch();
    console.log("LIVE_AUTH: OK");
  } catch (err) {
    const code =
      err && typeof err === "object" && "code" in err
        ? (err as { code?: unknown }).code
        : null;
    console.log("LIVE_AUTH: FAILED", { code: code ?? null });
  }
}

main().catch((err) => {
  console.error("probe failed:", err instanceof Error ? err.message : "unknown");
  process.exit(1);
});
