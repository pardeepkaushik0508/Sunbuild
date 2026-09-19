/**
 * Controlled one-shot Twilio Trial smoke test (no Next server-only imports).
 * Never prints secrets. Sends at most one SMS and/or one WhatsApp.
 *
 *   TWILIO_SMOKE_SMS=1 TWILIO_SMOKE_TO=+1XXXXXXXXXX node --import tsx scripts/twilio-trial-smoke.ts
 *   TWILIO_SMOKE_WHATSAPP=1 TWILIO_SMOKE_TO=+1XXXXXXXXXX node --import tsx scripts/twilio-trial-smoke.ts
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

function mask(value: string | null | undefined) {
  if (!value) return "(none)";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "••••";
  return `+••••${digits.slice(-4)}`;
}

function firstAcSid(raw: string | undefined): string {
  const v = (raw || "").trim();
  const m = v.match(/AC[0-9a-fA-F]{32}/);
  return m ? m[0] : v;
}

async function main() {
  loadEnvLocal();

  const doSms = process.env.TWILIO_SMOKE_SMS === "1";
  const doWa = process.env.TWILIO_SMOKE_WHATSAPP === "1";
  if (!doSms && !doWa) {
    console.log(
      "TWILIO TRIAL SMOKE: skipped (set TWILIO_SMOKE_SMS=1 and/or TWILIO_SMOKE_WHATSAPP=1)"
    );
    console.log(
      "Config presence (names only):",
      [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER",
        "TWILIO_WHATSAPP_FROM",
        "TWILIO_WHATSAPP_TEST_CONTENT_SID",
        "TWILIO_MODE",
        "TWILIO_TRIAL_TEMPLATE",
      ]
        .map((k) => `${k}=${process.env[k]?.trim() ? "SET" : "MISSING"}`)
        .join(", ")
    );
    return;
  }

  const accountSid = firstAcSid(process.env.TWILIO_ACCOUNT_SID);
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() || "";
  const to = process.env.TWILIO_SMOKE_TO?.trim();
  if (!accountSid || !authToken) {
    console.error("Twilio auth not configured");
    process.exit(1);
  }
  if (!to) {
    console.error(
      "TWILIO_SMOKE_TO is required for live smoke (E.164 verified Trial recipient)."
    );
    process.exit(1);
  }

  const appUrl = (process.env.APP_URL || "").trim();
  const publicCallbacks =
    /^https:\/\//i.test(appUrl) &&
    !/localhost|127\.0\.0\.1/i.test(appUrl);
  console.log("APP_URL public callbacks:", publicCallbacks ? "YES" : "NO (localhost omitted)");
  console.log("Smoke recipient:", mask(to));

  const client = twilio(accountSid, authToken);

  if (doSms) {
    const from = process.env.TWILIO_PHONE_NUMBER?.trim();
    const template =
      process.env.TWILIO_TRIAL_TEMPLATE?.trim() || "sms_internal_alerts";
    if (!from) {
      console.log("SMS: TWILIO_PHONE_NUMBER missing");
    } else {
      try {
        const message = await client.messages.create({
          to,
          from,
          body: template,
        });
        console.log("SMS result:", {
          ok: Boolean(message.sid),
          sidPresent: Boolean(message.sid),
          status: message.status,
          trialTemplate: template,
        });
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: unknown }).code
            : null;
        console.log("SMS result:", {
          ok: false,
          sidPresent: false,
          errorCode: code ?? null,
          diagnostic:
            err instanceof Error ? err.message.slice(0, 200) : "provider error",
        });
      }
    }
  }

  if (doWa) {
    const from = process.env.TWILIO_WHATSAPP_FROM?.trim();
    const contentSid = process.env.TWILIO_WHATSAPP_TEST_CONTENT_SID?.trim();
    if (!from) {
      console.log("WhatsApp: TWILIO_WHATSAPP_FROM missing");
    } else if (!contentSid) {
      console.log("WhatsApp: TWILIO_WHATSAPP_TEST_CONTENT_SID missing");
    } else {
      try {
        const message = await client.messages.create({
          from: `whatsapp:${from}`,
          to: `whatsapp:${to}`,
          contentSid,
          contentVariables: JSON.stringify({
            "1": "Smoke",
            "2": "SUNBUILD Trial",
          }),
        });
        console.log("WhatsApp result:", {
          ok: Boolean(message.sid),
          sidPresent: Boolean(message.sid),
          status: message.status,
          contentSidUsed: true,
        });
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? (err as { code?: unknown }).code
            : null;
        console.log("WhatsApp result:", {
          ok: false,
          sidPresent: false,
          errorCode: code ?? null,
          diagnostic:
            err instanceof Error ? err.message.slice(0, 200) : "provider error",
        });
      }
    }
  }

  console.log(
    "NOTE: Trial infrastructure may succeed while production custom SMS/WA templates remain unverified."
  );
}

main().catch((err) => {
  console.error("Smoke failed:", err instanceof Error ? err.message : "unknown");
  process.exit(1);
});
