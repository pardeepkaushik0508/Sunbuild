/**
 * Provider selection is env-only so automated WhatsApp cannot double-send
 * through Meta and Twilio.
 */

export function resolveWhatsAppProviderName(
  env: NodeJS.ProcessEnv = process.env
): "twilio" | "meta" | null {
  const explicit = env.WHATSAPP_PROVIDER?.trim().toLowerCase();
  const twilioReady = Boolean(
    env.TWILIO_ACCOUNT_SID?.trim() &&
      env.TWILIO_AUTH_TOKEN?.trim() &&
      env.TWILIO_WHATSAPP_FROM?.trim()
  );
  const metaReady = Boolean(
    env.WHATSAPP_PHONE_NUMBER_ID?.trim() && env.WHATSAPP_ACCESS_TOKEN?.trim()
  );

  if (explicit === "twilio") return twilioReady ? "twilio" : null;
  if (explicit === "meta") return metaReady ? "meta" : null;
  if (twilioReady) return "twilio";
  if (metaReady) return "meta";
  return null;
}

export function getWhatsAppInboxStatus(
  env: NodeJS.ProcessEnv = process.env
): {
  configured: boolean;
  provider: "twilio" | "meta" | null;
  trialSandbox: boolean;
} {
  const provider = resolveWhatsAppProviderName(env);
  return {
    configured: provider !== null,
    provider,
    trialSandbox:
      provider === "twilio" &&
      env.TWILIO_MODE?.trim().toLowerCase() !== "production",
  };
}
