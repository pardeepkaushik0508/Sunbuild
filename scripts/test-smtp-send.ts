/**
 * Dev-only SMTP smoke test. Does not print secrets.
 * Usage: npx tsx scripts/test-smtp-send.ts you@example.com
 */
import { config as loadEnv } from "dotenv";
import nodemailer from "nodemailer";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env") });
loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const to = process.argv[2]?.trim();
if (!to) {
  console.error("Usage: npx tsx scripts/test-smtp-send.ts recipient@example.com");
  process.exit(1);
}

const host = process.env.SMTP_HOST?.trim();
const user = process.env.SMTP_USER?.trim();
const pass = (process.env.SMTP_PASSWORD || "").replace(/\s+/g, "").trim();
const from =
  process.env.SMTP_FROM_EMAIL?.trim() ||
  process.env.SMTP_USER?.trim() ||
  "";
const port = Number(process.env.SMTP_PORT || "465");
const secure =
  (process.env.SMTP_SECURE || "").toLowerCase() === "true" || port === 465;

console.log("SMTP check:", {
  host: host || "(missing)",
  port,
  secure,
  userSet: Boolean(user),
  passSet: Boolean(pass),
  fromSet: Boolean(from),
  to,
});

if (!host || !user || !pass || !from) {
  console.error("SMTP not configured in .env.local");
  process.exit(1);
}

const transporter = nodemailer.createTransport({
  host,
  port,
  secure,
  auth: { user, pass },
  tls: { minVersion: "TLSv1.2" },
  connectionTimeout: 20_000,
});

async function main() {
  await transporter.verify();
  console.log("SMTP verify: OK");
  const info = await transporter.sendMail({
    from: { name: process.env.SMTP_FROM_NAME || "Sunbuild", address: from },
    to,
    subject: "Sunbuild SMTP test",
    text: "If you received this, SMTP invite delivery works from this machine.",
  });
  console.log("SMTP send: OK", { messageId: info.messageId });
}

main().catch((err) => {
  const message =
    err instanceof Error
      ? err.message.replace(/pass(word)?[=:].*/gi, "[redacted]")
      : "unknown";
  console.error("SMTP failed:", message);
  process.exit(1);
});
