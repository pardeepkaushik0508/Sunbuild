import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { channelsForNotificationType } from "../notifications/channels";
import { getWhatsAppInboxStatus, resolveWhatsAppProviderName } from "../messaging/provider-select";
import { buildTwilioWhatsAppPayload } from "../twilio/whatsapp-payload";

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

  it("treats Twilio WhatsApp env as the active inbox provider", () => {
    assert.equal(
      resolveWhatsAppProviderName({
        TWILIO_ACCOUNT_SID: "ACffffffffffffffffffffffffffffffff",
        TWILIO_AUTH_TOKEN: "test-auth-token",
        TWILIO_WHATSAPP_FROM: "+14155238886",
      }),
      "twilio"
    );
  });

  it("marks the CRM inbox as Twilio-connected instead of Meta test mode", () => {
    const inbox = getWhatsAppInboxStatus({
      TWILIO_ACCOUNT_SID: "ACffffffffffffffffffffffffffffffff",
      TWILIO_AUTH_TOKEN: "test-auth-token",
      TWILIO_WHATSAPP_FROM: "+14155238886",
      TWILIO_MODE: "trial",
    });
    assert.equal(inbox.configured, true);
    assert.equal(inbox.provider, "twilio");
    assert.equal(inbox.trialSandbox, true);
  });

  it("sends staff chat as the typed Twilio body, not a template", () => {
    const payload = buildTwilioWhatsAppPayload(
      { from: "+14155238886" },
      { to: "+14035550113", body: "Site update from SUNBUILD" }
    );
    assert.equal(payload.body, "Site update from SUNBUILD");
    assert.equal(payload.contentSid, undefined);
    assert.equal(payload.from, "whatsapp:+14155238886");
    assert.equal(payload.to, "whatsapp:+14035550113");
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
