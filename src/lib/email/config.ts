import "server-only";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
};

export type ResendConfig = {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyTo: string | null;
};

export type EmailProvider = "resend" | "smtp";

export class SmtpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpConfigError";
  }
}

/** Strip spaces (Gmail App Password copies) and surrounding quotes from env values. */
function normalizeSmtpPassword(raw: string): string {
  return raw.replace(/\s+/g, "").trim().replace(/^["']|["']$/g, "");
}

function envTrim(key: string): string | undefined {
  const v = process.env[key]?.trim();
  if (!v) return undefined;
  return v.replace(/^["']|["']$/g, "");
}

/** Shared from-address used by both SMTP and Resend. */
function resolveFromEmail(): string | undefined {
  return (
    envTrim("RESEND_FROM_EMAIL") ||
    envTrim("SMTP_FROM_EMAIL") ||
    envTrim("SMTP_USER")
  );
}

function resolveFromName(): string {
  return envTrim("RESEND_FROM_NAME") || envTrim("SMTP_FROM_NAME") || "Sunbuild";
}

function resolveReplyTo(): string | null {
  return envTrim("RESEND_REPLY_TO") || envTrim("SMTP_REPLY_TO") || null;
}

export function isResendConfigured(): boolean {
  return Boolean(envTrim("RESEND_API_KEY") && resolveFromEmail());
}

/** True when core SMTP credentials are present (no secrets returned). */
export function isSmtpConfigured(): boolean {
  return Boolean(
    envTrim("SMTP_HOST") &&
      envTrim("SMTP_USER") &&
      normalizeSmtpPassword(process.env.SMTP_PASSWORD || "") &&
      resolveFromEmail()
  );
}

/**
 * True when any supported mail provider can send.
 * Prefer Resend on hosts that block outbound SMTP (e.g. Render Free).
 */
export function isEmailConfigured(): boolean {
  return isResendConfigured() || isSmtpConfigured();
}

/** Active provider: Resend wins when both are set (HTTPS works on restricted hosts). */
export function getEmailProvider(): EmailProvider | null {
  if (isResendConfigured()) return "resend";
  if (isSmtpConfigured()) return "smtp";
  return null;
}

export function getResendConfig(): ResendConfig {
  const apiKey = envTrim("RESEND_API_KEY");
  const fromEmail = resolveFromEmail();
  if (!apiKey || !fromEmail) {
    throw new SmtpConfigError(
      "Resend is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL (or SMTP_FROM_EMAIL)."
    );
  }
  return {
    apiKey,
    fromEmail,
    fromName: resolveFromName(),
    replyTo: resolveReplyTo(),
  };
}

/**
 * Load and validate SMTP configuration.
 * Throws SmtpConfigError with a safe message (never includes password).
 */
export function getSmtpConfig(): SmtpConfig {
  const host = envTrim("SMTP_HOST");
  const user = envTrim("SMTP_USER");
  const password = normalizeSmtpPassword(process.env.SMTP_PASSWORD || "");
  const fromEmail = resolveFromEmail();
  const portRaw = envTrim("SMTP_PORT") || "465";
  const port = Number(portRaw);
  const secureRaw = (envTrim("SMTP_SECURE") ?? "").toLowerCase();
  // Port 587 typically uses STARTTLS (secure:false); 465 uses TLS (secure:true).
  const secure =
    secureRaw === "true"
      ? true
      : secureRaw === "false"
        ? false
        : port === 465;
  const fromName = resolveFromName();
  const replyTo = resolveReplyTo();

  const missing: string[] = [];
  if (!host) missing.push("SMTP_HOST");
  if (!user) missing.push("SMTP_USER");
  if (!password) missing.push("SMTP_PASSWORD");
  if (!fromEmail) missing.push("SMTP_FROM_EMAIL");
  if (!Number.isFinite(port) || port <= 0) missing.push("SMTP_PORT");

  if (missing.length > 0) {
    throw new SmtpConfigError(
      `SMTP is not configured. Missing or invalid: ${missing.join(", ")}`
    );
  }

  return {
    host: host!,
    port,
    secure,
    user: user!,
    password,
    fromEmail: fromEmail!,
    fromName,
    replyTo,
  };
}
