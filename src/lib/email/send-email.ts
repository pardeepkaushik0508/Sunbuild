import "server-only";

import { getSmtpConfig, SmtpConfigError } from "@/lib/email/config";
import { getMailTransporter } from "@/lib/email/transporter";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
  /** Optional tags for server logs only (never secrets). */
  tags?: Record<string, string>;
};

export type SendEmailResult = {
  success: true;
  messageId: string;
};

export type SendEmailFailure = {
  success: false;
  message: string;
};

const MAX_SUBJECT = 200;
const MAX_HTML = 200_000;
const MAX_TEXT = 100_000;

function normalizeRecipients(to: string | string[]): string[] {
  const list = (Array.isArray(to) ? to : [to])
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(list)];
}

function isValidEmail(email: string): boolean {
  // Practical RFC-ish check; Zod emailSchema is used at call sites for user input.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

/**
 * Application-level mail send. All transactional email should go through here.
 * Never logs SMTP_PASSWORD or message bodies that may contain reset tokens.
 */
export async function sendEmail(
  input: SendEmailInput
): Promise<SendEmailResult> {
  const recipients = normalizeRecipients(input.to);
  if (recipients.length === 0) {
    throw new SmtpConfigError("Email recipient is required");
  }
  for (const r of recipients) {
    if (!isValidEmail(r)) {
      throw new SmtpConfigError("Invalid recipient email address");
    }
  }

  const subject = input.subject.trim();
  if (!subject || subject.length > MAX_SUBJECT) {
    throw new SmtpConfigError("Invalid email subject");
  }
  if (!input.html?.trim() || input.html.length > MAX_HTML) {
    throw new SmtpConfigError("Invalid email HTML body");
  }
  if (input.text && input.text.length > MAX_TEXT) {
    throw new SmtpConfigError("Invalid email text body");
  }

  const config = getSmtpConfig();
  const transporter = getMailTransporter();

  try {
    const info = await transporter.sendMail({
      from: {
        name: config.fromName,
        address: config.fromEmail,
      },
      to: recipients.join(", "),
      subject,
      html: input.html,
      text: input.text?.trim() || undefined,
      replyTo: input.replyTo?.trim() || config.replyTo || undefined,
    });

    console.info("[email] sent", {
      toCount: recipients.length,
      subject,
      messageId: info.messageId,
      ...(input.tags ?? {}),
    });

    return { success: true, messageId: info.messageId || "" };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: string }).code)
        : undefined;
    const rawMessage =
      error instanceof Error
        ? error.message.replace(/pass(word)?[=:].*/gi, "[redacted]")
        : "unknown";
    console.error("[email] send failed", {
      code,
      message: rawMessage,
      ...(input.tags ?? {}),
    });

    const lower = rawMessage.toLowerCase();
    if (
      lower.includes("invalid login") ||
      lower.includes("badcredentials") ||
      lower.includes("username and password not accepted") ||
      lower.includes("535") ||
      code === "EAUTH"
    ) {
      throw new Error(
        "Email login rejected by SMTP. Use a valid Google App Password in SMTP_PASSWORD (.env.local) and restart the server."
      );
    }
    throw new Error("Unable to send email. Please try again.");
  }
}

/** Safe wrapper that returns a result object instead of throwing. */
export async function trySendEmail(
  input: SendEmailInput
): Promise<SendEmailResult | SendEmailFailure> {
  try {
    return await sendEmail(input);
  } catch (error) {
    if (error instanceof SmtpConfigError) {
      console.error("[email] config error:", error.message);
      return {
        success: false,
        message: "Email is not configured. Please contact your administrator.",
      };
    }
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to send email. Please try again.",
    };
  }
}
