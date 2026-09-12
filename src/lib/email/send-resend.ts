import "server-only";

import { getResendConfig, SmtpConfigError } from "@/lib/email/config";

type ResendSendInput = {
  to: string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string | null;
};

export class ResendAuthError extends Error {
  constructor(
    message = "Resend API key was rejected. Check RESEND_API_KEY in the host environment."
  ) {
    super(message);
    this.name = "ResendAuthError";
  }
}

/**
 * Send via Resend HTTPS API (port 443) — works on Render Free where SMTP is blocked.
 * https://resend.com/docs/api-reference/emails/send-email
 */
export async function sendViaResend(
  input: ResendSendInput
): Promise<{ messageId: string }> {
  const config = getResendConfig();

  const body: Record<string, unknown> = {
    from: `${config.fromName} <${config.fromEmail}>`,
    to: input.to,
    subject: input.subject,
    html: input.html,
  };
  if (input.text?.trim()) body.text = input.text.trim();
  const replyTo = input.replyTo?.trim() || config.replyTo;
  if (replyTo) body.reply_to = replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!res.ok) {
    const detail = raw.message || raw.name || `HTTP ${res.status}`;
    console.error("[email] resend failed", {
      status: res.status,
      message: String(detail).slice(0, 200),
    });
    if (res.status === 401 || res.status === 403) {
      throw new ResendAuthError();
    }
    throw new Error(`Unable to send email via Resend (${detail}).`);
  }

  if (!raw.id) {
    throw new SmtpConfigError("Resend returned an empty message id");
  }

  return { messageId: raw.id };
}

/** Lightweight API key check (does not send mail). */
export async function verifyResendConnection(): Promise<{
  ok: boolean;
  message: string;
}> {
  try {
    const config = getResendConfig();
    const res = await fetch("https://api.resend.com/domains", {
      method: "GET",
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        message:
          "Resend API key was rejected. Check RESEND_API_KEY in the host environment.",
      };
    }
    // 200 = key ok; other 2xx/4xx (e.g. rate limit) still mean the API is reachable with auth.
    if (res.ok || res.status === 429) {
      return {
        ok: true,
        message: `Resend API ready — emails send via HTTPS (from ${config.fromEmail}).`,
      };
    }
    return {
      ok: false,
      message: `Resend API check failed (HTTP ${res.status}). Verify RESEND_API_KEY.`,
    };
  } catch (error) {
    const msg =
      error instanceof Error ? error.message.slice(0, 160) : "unknown";
    console.error("[email] resend verify failed", { message: msg });
    return {
      ok: false,
      message:
        "Could not reach Resend API. Check outbound HTTPS and RESEND_API_KEY.",
    };
  }
}
