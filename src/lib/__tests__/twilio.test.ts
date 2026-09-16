/**
 * Twilio helpers: APP_URL webhook construction, E.164 phones, status mapping.
 * Run: npx tsx --test src/lib/__tests__/twilio.test.ts
 */

import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  getTwilioRequestUrl,
  getTwilioWebhookUrls,
} from "../twilio/webhooks";
import { TWILIO_INBOUND_PATH, TWILIO_SEND_PATH, TWILIO_STATUS_PATH } from "../twilio/constants";
import {
  digitsOnly,
  maskPhone,
  maskSid,
  phoneMatchTail,
  toE164,
} from "../twilio/phone";
import { mapTwilioMessageStatus } from "../twilio/status";
import {
  parseTwilioSendError,
  isUnverifiedRecipientError,
  UNVERIFIED_RECIPIENT_DIAGNOSTIC,
} from "../twilio/errors";
import { getTwilioSenderMode, selectTwilioFromFields } from "../twilio/sender";

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

describe("Twilio same-origin paths", () => {
  it("uses relative App Router paths (no host)", () => {
    assert.equal(TWILIO_SEND_PATH, "/api/twilio/send");
    assert.equal(TWILIO_STATUS_PATH, "/api/twilio/status");
    assert.equal(TWILIO_INBOUND_PATH, "/api/twilio/inbound");
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
    assert.equal(toE164(""), null);
    assert.equal(digitsOnly("+1 (403) 555-0100"), "14035550100");
    assert.equal(phoneMatchTail("+14035550100"), "4035550100");
  });

  it("masks secrets for settings display", () => {
    assert.equal(maskPhone("+14035550100"), "+••••0100");
    assert.equal(maskSid("MGabcdefghijklmnopqrstuvwxyz"), "MG••••wxyz");
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

describe("Twilio sender modes", () => {
  const KEYS2 = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_MESSAGING_SERVICE_SID",
    "TWILIO_PHONE_NUMBER",
  ] as const;
  const savedTwilio: Partial<Record<(typeof KEYS2)[number], string | undefined>> =
    {};

  function clearTwilio() {
    for (const key of KEYS2) {
      savedTwilio[key] = process.env[key];
      delete process.env[key];
    }
  }
  function restoreTwilio() {
    for (const key of KEYS2) {
      const value = savedTwilio[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }

  afterEach(restoreTwilio);

  it("is NOT_CONFIGURED without SID/token and without a sender", () => {
    clearTwilio();
    assert.equal(getTwilioSenderMode(), "not_configured");
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    assert.equal(getTwilioSenderMode(), "not_configured");
  });

  it("uses the trial phone number when Messaging Service is absent", () => {
    clearTwilio();
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_PHONE_NUMBER = "+14035550100";
    assert.equal(getTwilioSenderMode(), "phone_number");
    assert.deepEqual(
      selectTwilioFromFields({
        messagingServiceSid: null,
        phoneNumber: "+14035550100",
      }),
      { from: "+14035550100" }
    );
  });

  it("prefers Messaging Service when both senders exist", () => {
    clearTwilio();
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    process.env.TWILIO_PHONE_NUMBER = "+14035550100";
    process.env.TWILIO_MESSAGING_SERVICE_SID = "MGxxxx";
    assert.equal(getTwilioSenderMode(), "messaging_service");
    assert.deepEqual(
      selectTwilioFromFields({
        messagingServiceSid: "MGxxxx",
        phoneNumber: "+14035550100",
      }),
      { messagingServiceSid: "MGxxxx" }
    );
  });
});

describe("Twilio trial send errors", () => {
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

  it("sanitizes other Twilio errors without crashing", () => {
    const parsed = parseTwilioSendError({
      code: 20003,
      message: "Authenticate ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa failed",
    });
    assert.equal(parsed.unverifiedRecipient, false);
    assert.match(parsed.errorMessage, /AC…/);
    assert.doesNotMatch(parsed.errorMessage, /ACaaaaaaaa/);
  });
});
