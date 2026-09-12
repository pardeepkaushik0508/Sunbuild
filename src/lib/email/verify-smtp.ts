import "server-only";

import {
  getEmailProvider,
  getSmtpConfig,
  isEmailConfigured,
  isSmtpConfigured,
  SmtpConfigError,
} from "@/lib/email/config";
import { verifyResendConnection } from "@/lib/email/send-resend";
import { getMailTransporter, resetMailTransporter } from "@/lib/email/transporter";

function safeSmtpErrorMessage(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message.replace(/pass(word)?[=:].*/gi, "[redacted]")
      : "unknown";
  const lower = raw.toLowerCase();
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: string }).code).toLowerCase()
      : "";

  if (
    lower.includes("invalid login") ||
    lower.includes("badcredentials") ||
    lower.includes("username and password not accepted") ||
    lower.includes("535") ||
    lower.includes("authentication failed") ||
    lower.includes("eauth") ||
    code === "eauth"
  ) {
    return "SMTP login rejected by Google (535). Use a valid 16-character App Password in SMTP_PASSWORD (not your normal Gmail password), then restart the server.";
  }
  if (lower.includes("enotfound") || lower.includes("getaddrinfo")) {
    return "SMTP host could not be reached. Check SMTP_HOST.";
  }
  if (
    code === "etimedout" ||
    code === "econnrefused" ||
    code === "enetunreach" ||
    code === "esocket" ||
    lower.includes("etimedout") ||
    lower.includes("timeout") ||
    lower.includes("econnrefused") ||
    lower.includes("enetunreach")
  ) {
    return "SMTP connection blocked or timed out. Render Free blocks ports 465/587 — set RESEND_API_KEY (HTTPS) or upgrade to a paid Render instance.";
  }
  if (lower.includes("self signed") || lower.includes("certificate")) {
    return "SMTP TLS certificate error. Check SMTP_SECURE and SMTP_PORT (465 TLS or 587 STARTTLS).";
  }
  return "SMTP connection failed. Check SMTP_* env values (and restart). On Render Free, use RESEND_API_KEY instead.";
}

/**
 * Verify active email provider connectivity.
 * Call only from authorized server actions / scripts — not on every production send.
 */
export async function verifySmtpConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!isEmailConfigured()) {
    return {
      ok: false,
      message:
        "Email is not configured. Set RESEND_API_KEY + from address (recommended on Render), or SMTP_HOST / SMTP_USER / SMTP_PASSWORD / SMTP_FROM_EMAIL, then restart.",
    };
  }

  const provider = getEmailProvider();
  if (provider === "resend") {
    const resend = await verifyResendConnection();
    if (resend.ok) return resend;

    // Invalid Resend key should not hide a working SMTP fallback.
    if (isSmtpConfigured()) {
      try {
        getSmtpConfig();
        resetMailTransporter();
        await getMailTransporter().verify();
        return {
          ok: true,
          message:
            "Resend API key was rejected, but SMTP is working and will be used as fallback.",
        };
      } catch {
        // fall through with the Resend failure message
      }
    }
    return resend;
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
