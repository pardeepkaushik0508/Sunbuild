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
  const verifyToken =
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() || "sunbuild_whatsapp_verify";
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

export function isWhatsAppConfigured(): boolean {
  return getWhatsAppConfig() !== null;
}
