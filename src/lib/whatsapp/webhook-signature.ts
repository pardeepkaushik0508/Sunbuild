import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify Meta WhatsApp Cloud API webhook signatures (X-Hub-Signature-256).
 * HMAC-SHA256 over the raw request body, keyed with WHATSAPP_APP_SECRET.
 */
export function verifyWhatsAppSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null,
  appSecret: string | undefined
): boolean {
  if (!appSecret) {
    // Production must set WHATSAPP_APP_SECRET; reject when configured WA but secret missing.
    return false;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected =
    "sha256=" +
    createHmac("sha256", appSecret).update(rawBody).digest("hex");

  try {
    const a = Buffer.from(signatureHeader, "utf8");
    const b = Buffer.from(expected, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
