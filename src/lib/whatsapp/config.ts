import "server-only";

export type WhatsAppConfig = {
  phoneNumberId: string;
  accessToken: string;
  verifyToken: string;
  appSecret?: string;
  graphApiVersion: string;
};

export function getWhatsAppConfig(): WhatsAppConfig | null {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const verifyToken = getWhatsAppVerifyToken() ?? "";
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();

  if (!phoneNumberId || !accessToken) {
    return null;
  }

  return {
    phoneNumberId,
    accessToken,
    verifyToken,
    appSecret,
    graphApiVersion: "v21.0",
  };
}

/** Verify-token for Meta GET handshake (may be set before full API credentials). */
export function getWhatsAppVerifyToken(): string | null {
  const token =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ||
    process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  return token || null;
}

export function getWhatsAppAppSecret(): string | undefined {
  return process.env.WHATSAPP_APP_SECRET?.trim() || undefined;
}

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}
