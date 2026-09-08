import "server-only";

import { getMailTransporter, resetMailTransporter } from "@/lib/email/transporter";
import { getSmtpConfig, isSmtpConfigured, SmtpConfigError } from "@/lib/email/config";

function safeSmtpErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message.replace(/pass(word)?[=:].*/gi, "[redacted]")
      : "unknown";
  const lower = raw.toLowerCase();
  if (
    lower.includes("invalid login") ||
    lower.includes("badcredentials") ||
    lower.includes("username and password not accepted") ||
    lower.includes("535") ||
    lower.includes("authentication failed") ||
    lower.includes("eauth")
  ) {
    return "SMTP login rejected by Google (535). Use a valid 16-character App Password for SMTP_USER in .env.local (not your normal Gmail password), then restart the server.";
  }
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) {
    return "SMTP host could not be reached. Check SMTP_HOST.";
  }
  if (lower.includes("etimedout") || lower.includes("timeout")) {
    return "SMTP connection timed out. Check SMTP_HOST / SMTP_PORT / firewall.";
  }
  if (lower.includes("self signed") || lower.includes("certificate")) {
    return "SMTP TLS certificate error. Check SMTP_SECURE and SMTP_PORT (465 TLS or 587 STARTTLS).";
  }
  return "SMTP connection failed. Check SMTP_* values in .env.local and restart the server.";
}

/**
 * Verify SMTP connectivity. Call only from authorized server actions / scripts.
 * Do not run on every production send.
 */
export async function verifySmtpConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isSmtpConfigured()) {
    return {
      ok: false,
      message:
        "SMTP is not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and SMTP_FROM_EMAIL in .env.local, then restart the server.",
    };
  }

  try {
    getSmtpConfig();
    resetMailTransporter();
    await getMailTransporter().verify();
    return {
      ok: true,
      message: "SMTP connection successful — email is ready to send.",
    };
  } catch (error) {
    if (error instanceof SmtpConfigError) {
      return { ok: false, message: error.message };
    }
    console.error("[email] verify failed", {
      message:
        error instanceof Error
          ? error.message.replace(/pass(word)?[=:].*/gi, "[redacted]")
          : "unknown",
    });
    resetMailTransporter();
    return { ok: false, message: safeSmtpErrorMessage(error) };
  }
}
