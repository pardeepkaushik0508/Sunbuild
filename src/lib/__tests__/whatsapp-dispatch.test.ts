import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { channelsForNotificationType } from "../notifications/channels";

function resolveWhatsAppConfig(env: NodeJS.ProcessEnv) {
  const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  const accessToken = env.WHATSAPP_ACCESS_TOKEN?.trim();
  const verifyToken =
    env.WHATSAPP_WEBHOOK_VERIFY_TOKEN?.trim() ||
    env.WHATSAPP_VERIFY_TOKEN?.trim() ||
    "";
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken, verifyToken };
}

describe("WhatsApp configuration and channel rules", () => {
  it("is not configured without token + phone number id", () => {
    assert.equal(resolveWhatsAppConfig({}), null);
    assert.ok(
      resolveWhatsAppConfig({
        WHATSAPP_PHONE_NUMBER_ID: "123",
        WHATSAPP_ACCESS_TOKEN: "token",
        WHATSAPP_VERIFY_TOKEN: "verify",
      })
    );
  });

  it("does not WhatsApp every notification type", () => {
    assert.equal(
      channelsForNotificationType("INVOICE_OVERDUE").channels.includes("whatsapp"),
      false
    );
    assert.equal(
      channelsForNotificationType("TASK_DUE_TODAY").channels.includes("whatsapp"),
      true
    );
  });
});
