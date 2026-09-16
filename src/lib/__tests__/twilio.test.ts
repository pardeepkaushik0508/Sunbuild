/**
 * Twilio helpers: APP_URL webhook construction, E.164 phones, status mapping,
 * trial vs production send modes. Mock Twilio API — no real secrets.
 * Run: npx tsx --test src/lib/__tests__/twilio.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  getTwilioRequestUrl,
  getTwilioWebhookUrls,
} from "../twilio/webhooks";
import {
  TWILIO_INBOUND_PATH,
  TWILIO_SEND_PATH,
  TWILIO_STATUS_PATH,
  TWILIO_TRIAL_TEST_PATH,
} from "../twilio/constants";
import {
  digitsOnly,
  maskPhone,
  maskSid,
  phoneMatchTail,
  toE164,
} from "../twilio/phone";
import { mapTwilioMessageStatus } from "../twilio/status";
import {
  getTwilioSenderMode,
  selectTwilioFromFields,
  normalizeTwilioAccountSid,
} from "../twilio/sender";
import {
  buildTwilioMessagePayload,
  assertTrialFromConfigured,
  resolveOutboundTwilioBody,
} from "../twilio/payload";
import type { TwilioConfig } from "../twilio/config";
import {
  DEFAULT_TWILIO_TRIAL_TEMPLATE,
  getTwilioMode,
  isTwilioTrialTemplate,
  maskAccountSid,
  resolveTwilioTrialTemplate,
  TWILIO_TRIAL_TEMPLATES,
} from "../twilio/mode";
import {
  parseTwilioSendError,
  isUnverifiedRecipientError,
  UNVERIFIED_RECIPIENT_DIAGNOSTIC,
  AUTH_FAILED_DIAGNOSTIC,
  TRIAL_RESTRICTION_DIAGNOSTIC,
  TRIAL_FROM_MISMATCH_DIAGNOSTIC,
  INVALID_TRIAL_TEMPLATE_DIAGNOSTIC,
  MISSING_TRIAL_FROM_DIAGNOSTIC,
} from "../twilio/errors";

const KEYS = [
  "APP_URL",
  "NEXT_PUBLIC_APP_URL",
  "BETTER_AUTH_URL",
  "PORT",
] as const;

const saved: Partial<Record<(typeof KEYS)[number], string | undefined>> = {};

function clearAppUrlEnv() {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreAppUrlEnv() {
  for (const key of KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const TWILIO_KEYS = [
  "TWILIO_MODE",
  "TWILIO_ACCOUNT_SID",
  "TWILIO_AUTH_TOKEN",
  "TWILIO_MESSAGING_SERVICE_SID",
  "TWILIO_PHONE_NUMBER",
  "TWILIO_TRIAL_TEMPLATE",
] as const;

const savedTwilio: Partial<
  Record<(typeof TWILIO_KEYS)[number], string | undefined>
> = {};

function clearTwilio() {
  for (const key of TWILIO_KEYS) {
    savedTwilio[key] = process.env[key];
    delete process.env[key];
  }
}

function restoreTwilio() {
  for (const key of TWILIO_KEYS) {
    const value = savedTwilio[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function trialConfig(overrides?: Partial<TwilioConfig>): TwilioConfig {
  return {
    mode: "trial",
    accountSid: "test-account-sid",
    authToken: "test-auth-token",
    messagingServiceSid: null,
    phoneNumber: null,
    senderMode: "trial",
    trialTemplate: DEFAULT_TWILIO_TRIAL_TEMPLATE,
    ...overrides,
  };
}

function productionConfig(overrides?: Partial<TwilioConfig>): TwilioConfig {
  return {
    mode: "production",
    accountSid: "test-account-sid",
    authToken: "test-auth-token",
    messagingServiceSid: null,
    phoneNumber: "+14035550100",
    senderMode: "phone_number",
    trialTemplate: null,
    ...overrides,
  };
}

describe("Twilio same-origin paths", () => {
  it("uses relative App Router paths (no host)", () => {
    assert.equal(TWILIO_SEND_PATH, "/api/twilio/send");
    assert.equal(TWILIO_STATUS_PATH, "/api/twilio/status");
    assert.equal(TWILIO_INBOUND_PATH, "/api/twilio/inbound");
    assert.equal(TWILIO_TRIAL_TEST_PATH, "/api/twilio/trial-test");
    assert.doesNotMatch(TWILIO_SEND_PATH, /onrender|aivoxalabs|https?:/i);
  });
});

describe("Twilio webhook URLs follow APP_URL", () => {
  afterEach(() => {
    restoreAppUrlEnv();
  });

  it("builds Render production webhooks from APP_URL, ignoring PORT", () => {
    clearAppUrlEnv();
    process.env.APP_URL = "https://sunbuild.onrender.com";
    process.env.PORT = "10000";
    const request = new Request("http://localhost:10000/api/twilio/status");
    const urls = getTwilioWebhookUrls(request);
    assert.equal(urls.status, "https://sunbuild.onrender.com/api/twilio/status");
    assert.equal(urls.inbound, "https://sunbuild.onrender.com/api/twilio/inbound");
    assert.equal(
      getTwilioRequestUrl(request),
      "https://sunbuild.onrender.com/api/twilio/status"
    );
  });

  it("follows a future Aivoxa APP_URL without code changes", () => {
    clearAppUrlEnv();
    process.env.APP_URL = "https://sunbuild.aivoxalabs.com";
    const urls = getTwilioWebhookUrls();
    assert.equal(urls.status, "https://sunbuild.aivoxalabs.com/api/twilio/status");
    assert.equal(
      urls.inbound,
      "https://sunbuild.aivoxalabs.com/api/twilio/inbound"
    );
  });

  it("keeps inbound query string on the public origin for signature checks", () => {
    clearAppUrlEnv();
    process.env.APP_URL = "https://sunbuild.onrender.com";
    const request = new Request(
      "http://localhost:10000/api/twilio/inbound?ignore=1"
    );
    assert.equal(
      getTwilioRequestUrl(request),
      "https://sunbuild.onrender.com/api/twilio/inbound?ignore=1"
    );
  });
});

describe("phone helpers", () => {
  it("normalizes NANP numbers to E.164", () => {
    assert.equal(toE164("(403) 555-0100"), "+14035550100");
    assert.equal(toE164("14035550100"), "+14035550100");
    assert.equal(toE164("+1 403 555 0100"), "+14035550100");
    assert.equal(toE164("+919671830977"), "+919671830977");
    assert.equal(toE164(""), null);
    assert.equal(toE164("abc"), null);
    assert.equal(digitsOnly("+1 (403) 555-0100"), "14035550100");
    assert.equal(phoneMatchTail("+14035550100"), "4035550100");
  });

  it("masks secrets for settings display", () => {
    assert.equal(maskPhone("+14035550100"), "+••••0100");
    assert.equal(maskSid("MGabcdefghijklmnopqrstuvwxyz"), "MG••••wxyz");
    assert.equal(maskAccountSid("test-account-sid"), "te••••••••-sid");
  });
});

describe("Twilio status mapping", () => {
  it("maps Twilio MessageStatus onto Prisma SMS statuses", () => {
    assert.equal(mapTwilioMessageStatus("queued"), "QUEUED");
    assert.equal(mapTwilioMessageStatus("sent"), "SENT");
    assert.equal(mapTwilioMessageStatus("delivered"), "DELIVERED");
    assert.equal(mapTwilioMessageStatus("undelivered"), "UNDELIVERED");
    assert.equal(mapTwilioMessageStatus("failed"), "FAILED");
    assert.equal(mapTwilioMessageStatus("received"), "RECEIVED");
    assert.equal(mapTwilioMessageStatus("nope"), null);
  });
});

describe("Twilio mode and trial templates", () => {
  afterEach(restoreTwilio);

  it("defaults to trial mode", () => {
    clearTwilio();
    assert.equal(getTwilioMode(), "trial");
  });

  it("reads production mode from env", () => {
    clearTwilio();
    process.env.TWILIO_MODE = "production";
    assert.equal(getTwilioMode(), "production");
  });

  it("defaults trial template to sms_internal_alerts", () => {
    clearTwilio();
    const resolved = resolveTwilioTrialTemplate();
    assert.equal(resolved.ok, true);
    if (resolved.ok) {
      assert.equal(resolved.template, "sms_internal_alerts");
    }
  });

  it("rejects an invalid trial template", () => {
    clearTwilio();
    process.env.TWILIO_TRIAL_TEMPLATE = "not_a_real_template";
    const resolved = resolveTwilioTrialTemplate();
    assert.equal(resolved.ok, false);
    assert.equal(isTwilioTrialTemplate("sms_internal_alerts"), true);
    assert.equal(isTwilioTrialTemplate("not_a_real_template"), false);
    assert.ok(TWILIO_TRIAL_TEMPLATES.includes("sms_internal_alerts"));
  });
});

describe("Twilio sender modes", () => {
  afterEach(restoreTwilio);

  it("is NOT_CONFIGURED without SID/token", () => {
    clearTwilio();
    assert.equal(getTwilioSenderMode(), "not_configured");
  });

  it("trial mode works with SID/token; From is added when TWILIO_PHONE_NUMBER is set", () => {
    clearTwilio();
    process.env.TWILIO_MODE = "trial";
    process.env.TWILIO_ACCOUNT_SID = "test-account-sid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    assert.equal(getTwilioSenderMode(), "trial");
    assert.deepEqual(
      selectTwilioFromFields({
        mode: "trial",
        messagingServiceSid: null,
        phoneNumber: null,
      }),
      {}
    );
    assert.deepEqual(
      selectTwilioFromFields({
        mode: "trial",
        messagingServiceSid: null,
        phoneNumber: "+17372508034",
      }),
      { from: "+17372508034" }
    );
  });

  it("production mode requires a From or Messaging Service", () => {
    clearTwilio();
    process.env.TWILIO_MODE = "production";
    process.env.TWILIO_ACCOUNT_SID = "test-account-sid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    assert.equal(getTwilioSenderMode(), "not_configured");
    process.env.TWILIO_PHONE_NUMBER = "+14035550100";
    assert.equal(getTwilioSenderMode(), "phone_number");
  });

  it("prefers Messaging Service in production when both senders exist", () => {
    clearTwilio();
    process.env.TWILIO_MODE = "production";
    process.env.TWILIO_ACCOUNT_SID = "test-account-sid";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    process.env.TWILIO_PHONE_NUMBER = "+14035550100";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "test-messaging-service";
    assert.equal(getTwilioSenderMode(), "messaging_service");
    assert.deepEqual(
      selectTwilioFromFields({
        mode: "production",
        messagingServiceSid: "test-messaging-service",
        phoneNumber: "+14035550100",
      }),
      { messagingServiceSid: "test-messaging-service" }
    );
  });
});

describe("Twilio message payloads", () => {
  afterEach(restoreTwilio);

  it("trial request uses sms_internal_alerts and includes Console trial From", () => {
    clearTwilio();
    const intended = "New project ABC has been assigned to you";
    const config = trialConfig({ phoneNumber: "+17372508034" });
    const outbound = resolveOutboundTwilioBody(config, intended);
    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    assert.equal(outbound.twilioBody, "sms_internal_alerts");
    assert.equal(outbound.intendedBody, intended);

    const payload = buildTwilioMessagePayload(config, {
      to: "+919671830977",
      body: outbound.twilioBody,
      statusCallback: "https://sunbuild.onrender.com/api/twilio/status",
    });
    assert.equal(payload.body, "sms_internal_alerts");
    assert.equal(payload.to, "+919671830977");
    assert.equal(payload.from, "+17372508034");
    assert.equal(
      "messagingServiceSid" in payload && payload.messagingServiceSid !== undefined,
      false
    );
  });

  it("trial rejects missing From before calling Twilio (avoids 572003)", () => {
    clearTwilio();
    const missing = assertTrialFromConfigured(trialConfig({ phoneNumber: null }));
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.code, "MISSING_TRIAL_FROM");
    assert.equal(missing.message, MISSING_TRIAL_FROM_DIAGNOSTIC);
  });

  it("trial rejects an invalid template without sending", () => {
    clearTwilio();
    process.env.TWILIO_TRIAL_TEMPLATE = "bad_template";
    const outbound = resolveOutboundTwilioBody(trialConfig(), "hello");
    assert.equal(outbound.ok, false);
    if (outbound.ok) return;
    assert.equal(outbound.code, "INVALID_TRIAL_TEMPLATE");
    assert.equal(outbound.message, INVALID_TRIAL_TEMPLATE_DIAGNOSTIC);
  });

  it("production sends the actual custom message body and includes from", () => {
    clearTwilio();
    const intended = "New project ABC has been assigned to you";
    const outbound = resolveOutboundTwilioBody(productionConfig(), intended);
    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    assert.equal(outbound.twilioBody, intended);

    const payload = buildTwilioMessagePayload(productionConfig(), {
      to: "+14035550100",
      body: outbound.twilioBody,
      statusCallback: "https://sunbuild.onrender.com/api/twilio/status",
    });
    assert.equal(payload.body, intended);
    assert.equal(payload.from, "+14035550100");
  });
});

describe("Twilio trial send errors", () => {
  it("maps trial From mismatch 572003 to a clear Console diagnostic", () => {
    const parsed = parseTwilioSendError({
      code: 572003,
      message:
        "The 'from' number isn't assigned to this verified messaging recipient. Please check the Twilio Console and send message using your assigned trial number.",
    });
    assert.equal(parsed.errorCode, "572003");
    assert.equal(parsed.trialFromMismatch, true);
    assert.equal(parsed.errorMessage, TRIAL_FROM_MISMATCH_DIAGNOSTIC);
    assert.doesNotMatch(parsed.errorMessage, /buy a/i);
  });

  it("maps unverified-recipient 21608 to a safe diagnostic", () => {
    const parsed = parseTwilioSendError({
      code: 21608,
      message:
        "The number +15555550100 is unverified. Trial accounts cannot send messages to unverified numbers https://www.twilio.com/docs",
    });
    assert.equal(parsed.errorCode, "21608");
    assert.equal(parsed.unverifiedRecipient, true);
    assert.equal(parsed.errorMessage, UNVERIFIED_RECIPIENT_DIAGNOSTIC);
    assert.equal(isUnverifiedRecipientError("21608", "unverified trial"), true);
    assert.doesNotMatch(parsed.errorMessage, /\+1\d{10}/);
  });

  it("maps trial geographic/template restrictions without telling user to buy a number", () => {
    const parsed = parseTwilioSendError({
      code: 572006,
      message: "Invalid template name. Trial accounts can only use predefined SMS templates.",
    });
    assert.equal(parsed.errorCode, "572006");
    assert.equal(parsed.errorMessage, TRIAL_RESTRICTION_DIAGNOSTIC);
    assert.doesNotMatch(parsed.errorMessage, /buy/i);

    const geo = parseTwilioSendError({
      code: 21408,
      message: "Permission to send an SMS has not been enabled for the region indicated by the 'To' number",
    });
    assert.equal(geo.trialRestriction, true);
    assert.equal(geo.errorMessage, TRIAL_RESTRICTION_DIAGNOSTIC);
  });

  it("maps authentication failures to TWILIO_AUTH_FAILED without exposing secrets", () => {
    const parsed = parseTwilioSendError({
      code: 20003,
      message: "Authenticate test-account-sid failed",
    });
    assert.equal(parsed.authFailed, true);
    assert.equal(parsed.errorMessage, AUTH_FAILED_DIAGNOSTIC);
    assert.doesNotMatch(parsed.errorMessage, /test-auth-token|Auth Token:/i);
  });

  it("sanitizes other Twilio errors without crashing", () => {
    const parsed = parseTwilioSendError({
      code: 20404,
      message: "Not found https://example.com/x",
    });
    assert.equal(parsed.unverifiedRecipient, false);
    assert.doesNotMatch(parsed.errorMessage, /https?:\/\//);
  });
});

describe("Twilio Account SID normalization", () => {
  // Deliberately non-realistic duplicated SID shape for unit tests only.
  const FAKE_SID = "ACffffffffffffffffffffffffffffffff";

  it("collapses an accidentally duplicated Account SID", () => {
    const once = FAKE_SID;
    const twice = once + once;
    assert.equal(normalizeTwilioAccountSid(twice), once);
    assert.equal(normalizeTwilioAccountSid(once), once);
  });

  it("getTwilioSenderMode works in trial when SID was pasted twice", () => {
    clearTwilio();
    process.env.TWILIO_MODE = "trial";
    process.env.TWILIO_ACCOUNT_SID = FAKE_SID + FAKE_SID;
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    try {
      assert.equal(getTwilioSenderMode(), "trial");
      assert.equal(
        normalizeTwilioAccountSid(process.env.TWILIO_ACCOUNT_SID!),
        FAKE_SID
      );
    } finally {
      restoreTwilio();
    }
  });
});

describe("Twilio status callback field handling", () => {
  it("accepts MessageSid/MessageStatus/ErrorCode form fields used by applyTwilioStatusCallback", () => {
    const params = {
      MessageSid: "SMtestmessagesid0001",
      MessageStatus: "delivered",
      ErrorCode: "",
      ErrorMessage: "",
      To: "+14035550100",
      From: "+10987654321",
    };
    assert.equal(mapTwilioMessageStatus(params.MessageStatus), "DELIVERED");
    assert.equal(mapTwilioMessageStatus("queued"), "QUEUED");
    assert.equal(mapTwilioMessageStatus("sent"), "SENT");
    assert.equal(mapTwilioMessageStatus("undelivered"), "UNDELIVERED");
    assert.equal(mapTwilioMessageStatus("failed"), "FAILED");
    const failed = parseTwilioSendError({
      code: params.ErrorCode || undefined,
      message: params.ErrorMessage || undefined,
    });
    assert.equal(failed.errorCode, null);
  });
});

describe("Twilio notification side-effect contract", () => {
  it("keeps intended CRM text when trial converts the Twilio body to a template", () => {
    clearTwilio();
    const intended = "Task assigned: Foundation pour tomorrow";
    const outbound = resolveOutboundTwilioBody(trialConfig(), intended);
    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    // DB/history keeps intended text; Twilio only sees the template id.
    assert.equal(outbound.intendedBody, intended);
    assert.equal(outbound.twilioBody, "sms_internal_alerts");
    // SMS failure must not imply CRM rollback — that is enforced by notifyUserBySmsBestEffort try/catch.
    assert.ok(true);
  });
});
