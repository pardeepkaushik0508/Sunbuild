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

export class SmtpConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SmtpConfigError";
  }
}

/** Gmail App Passwords are often copied with spaces — strip them. */
function normalizeSmtpPassword(raw: string): string {
  return raw.replace(/\s+/g, "").trim();
}

/** True when core SMTP credentials are present (no secrets returned). */
export function isSmtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      normalizeSmtpPassword(process.env.SMTP_PASSWORD || "") &&
      (process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim())
  );
}

/**
 * Load and validate SMTP configuration.
 * Throws SmtpConfigError with a safe message (never includes password).
 */
export function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = normalizeSmtpPassword(process.env.SMTP_PASSWORD || "");
  const fromEmail =
    process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim();
  const portRaw = process.env.SMTP_PORT?.trim() || "465";
  const port = Number(portRaw);
  const secureRaw = (process.env.SMTP_SECURE ?? "").toLowerCase();
  // Port 587 typically uses STARTTLS (secure:false); 465 uses TLS (secure:true).
  const secure =
    secureRaw === "true"
      ? true
      : secureRaw === "false"
        ? false
        : port === 465;
  const fromName = process.env.SMTP_FROM_NAME?.trim() || "Sunbuild";
  const replyTo = process.env.SMTP_REPLY_TO?.trim() || null;

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
