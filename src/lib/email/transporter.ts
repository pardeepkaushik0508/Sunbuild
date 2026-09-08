import "server-only";

import nodemailer, { type Transporter } from "nodemailer";
import { getSmtpConfig } from "@/lib/email/config";

declare global {
  var __sunbuildSmtpTransporter: Transporter | undefined;
  var __sunbuildSmtpFingerprint: string | undefined;
}

function configFingerprint(): string {
  const c = getSmtpConfig();
  return `${c.host}|${c.port}|${c.secure}|${c.user}|${c.fromEmail}`;
}

/** Drop cached transporter (e.g. after env change or auth failure). */
export function resetMailTransporter() {
  globalThis.__sunbuildSmtpTransporter = undefined;
  globalThis.__sunbuildSmtpFingerprint = undefined;
}

/**
 * Singleton Nodemailer transporter (Node.js runtime only).
 * Do not import this module from Client Components.
 */
export function getMailTransporter(): Transporter {
  const fingerprint = configFingerprint();
  if (
    globalThis.__sunbuildSmtpTransporter &&
    globalThis.__sunbuildSmtpFingerprint === fingerprint
  ) {
    return globalThis.__sunbuildSmtpTransporter;
  }

  const config = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.password,
    },
    // Helpful for Gmail / corporate SMTP reliability
    tls: {
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
  });

  globalThis.__sunbuildSmtpTransporter = transporter;
  globalThis.__sunbuildSmtpFingerprint = fingerprint;
  return transporter;
}
