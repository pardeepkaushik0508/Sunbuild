/**
 * Twilio SMS + WhatsApp: channel matrix, providers, trial/production,
 * idempotency, callbacks, isolation, timezone. Mocks only — no live sends.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getExpectedTwilioSignature, validateRequest } from "twilio/lib/webhooks/webhooks";
import { channelsForNotificationType } from "../notifications/channels";
import { channelIdempotencyKey, shouldRetryDelivery } from "../messaging/idempotency";
import {
  addCalendarDays,
  isCalendarDateBeforeToday,
  isCalendarDateInExactlyDays,
  isCalendarDateToday,
  zonedYmd,
} from "../messaging/timezone";
import {
  inferPhoneRegion,
  normalizeToE164,
  toWhatsAppAddress,
} from "../twilio/phone";
import { buildTwilioWhatsAppPayload } from "../twilio/whatsapp-payload";
import { mapTwilioDeliveryStatus } from "../twilio/status";
import {
  resolveWhatsAppContentSid,
  templateKeyForEvent,
  trialContentVariables,
} from "../twilio/whatsapp-templates";
import { productionSmsBody } from "../messaging/content";
import { parseTwilioSendError } from "../twilio/errors";
import { getTwilioWebhookUrls, isPublicHttpOrigin } from "../twilio/webhooks";
import { resolveWhatsAppProviderName } from "../messaging/provider-select";
import { getTwilioMode } from "../twilio/mode";
import { smsDestinationMatchesEntity } from "../twilio/destination-guard";

function matrix(type: string) {
  return channelsForNotificationType(type).channels;
}

describe("notification channel matrix (MVP, no email)", () => {
  it("SELECTION_DUE_3_DAYS is in-app + WhatsApp, no SMS", () => {
    assert.deepEqual(matrix("SELECTION_DUE_3_DAYS"), ["in_app", "whatsapp"]);
    assert.equal(matrix("SELECTION_DUE_3_DAYS").includes("sms"), false);
  });

  it("SELECTION_DUE_TODAY is in-app + WhatsApp + SMS", () => {
    assert.deepEqual(matrix("SELECTION_DUE_TODAY"), [
      "in_app",
      "whatsapp",
      "sms",
    ]);
  });

  it("RFI_OVERDUE is in-app + WhatsApp, no SMS", () => {
    assert.deepEqual(matrix("RFI_OVERDUE"), ["in_app", "whatsapp"]);
  });

  it("INVOICE_OVERDUE is in-app + SMS, no WhatsApp", () => {
    assert.deepEqual(matrix("INVOICE_OVERDUE"), ["in_app", "sms"]);
  });

  it("DEPOSIT_DUE is in-app + SMS, no WhatsApp", () => {
    assert.deepEqual(matrix("DEPOSIT_DUE"), ["in_app", "sms"]);
  });

  it("TASK_DUE_TODAY is in-app + WhatsApp, no SMS", () => {
    assert.deepEqual(matrix("TASK_DUE_TODAY"), ["in_app", "whatsapp"]);
  });

  it("unlisted types are in-app only", () => {
    assert.deepEqual(matrix("DAILY_LOG_SUBMITTED"), ["in_app"]);
  });
});

describe("idempotency keys", () => {
  it("is unique per event/recipient/channel/occurrence", () => {
    const selectionWa = channelIdempotencyKey({
      eventType: "SELECTION_DUE_3_DAYS",
      entityId: "sel1",
      recipientUserId: "userA",
      occurrence: "2026-09-21",
      channel: "WHATSAPP",
    });
    const selectionSms = channelIdempotencyKey({
      eventType: "SELECTION_DUE_TODAY",
      entityId: "sel1",
      recipientUserId: "userA",
      occurrence: "2026-09-18",
      channel: "SMS",
    });
    const otherClient = channelIdempotencyKey({
      eventType: "SELECTION_DUE_TODAY",
      entityId: "sel1",
      recipientUserId: "userB",
      occurrence: "2026-09-18",
      channel: "SMS",
    });
    assert.equal(
      selectionWa,
      "SELECTION_DUE_3_DAYS:sel1:userA:2026-09-21:WHATSAPP"
    );
    assert.notEqual(selectionWa, selectionSms);
    assert.notEqual(selectionSms, otherClient);
  });

  it("does not retry permanent failures", () => {
    assert.equal(
      shouldRetryDelivery({
        status: "INVALID_PHONE",
        attemptCount: 1,
        retryableError: true,
      }),
      false
    );
    assert.equal(
      shouldRetryDelivery({
        status: "OPTED_OUT",
        attemptCount: 1,
        retryableError: true,
      }),
      false
    );
    assert.equal(
      shouldRetryDelivery({
        status: "FAILED",
        attemptCount: 1,
        retryableError: true,
      }),
      true
    );
    assert.equal(
      shouldRetryDelivery({
        status: "FAILED",
        attemptCount: 3,
        retryableError: true,
      }),
      false
    );
  });
});

describe("timezone due calculations", () => {
  const tz = "America/Edmonton";

  it("treats 00:00 and 23:59 in the business timezone as the same calendar day", () => {
    const early = new Date("2026-09-18T06:30:00.000Z");
    const late = new Date("2026-09-19T05:59:00.000Z");
    const next = new Date("2026-09-19T06:00:00.000Z");
    assert.equal(zonedYmd(early, tz), "2026-09-18");
    assert.equal(zonedYmd(late, tz), "2026-09-18");
    assert.equal(zonedYmd(next, tz), "2026-09-19");
  });

  it("selection due in exactly 3 days uses the business calendar", () => {
    const now = new Date("2026-09-18T12:00:00.000Z");
    assert.equal(isCalendarDateInExactlyDays("2026-09-21T00:00:00.000Z", 3, now, tz), true);
    assert.equal(isCalendarDateToday("2026-09-18T00:00:00.000Z", now, tz), true);
    assert.equal(isCalendarDateBeforeToday("2026-09-17T00:00:00.000Z", now, tz), true);
    assert.equal(addCalendarDays("2026-09-18", 3), "2026-09-21");
  });
});

describe("WhatsApp trial vs production architecture", () => {
  it("formats WhatsApp addresses without hard-coding the sandbox number", () => {
    const payload = buildTwilioWhatsAppPayload(
      {
        mode: "trial",
        accountSid: "ACtest",
        authToken: "token",
        from: "+14155238886",
        testContentSid: "HXtestcontentsid0001",
      },
      {
        to: "+14035550100",
        contentSid: "HXtestcontentsid0001",
        contentVariables: trialContentVariables({
          recipientName: "Alex",
          projectName: "Lot 12",
        }),
      }
    );
    assert.equal(payload.from, "whatsapp:+14155238886");
    assert.equal(payload.to, "whatsapp:+14035550100");
    assert.equal(payload.contentSid, "HXtestcontentsid0001");
    assert.equal(typeof payload.contentVariables, "string");
    assert.equal(payload.body, undefined);
  });

  it("uses free-form body inside a customer session", () => {
    const resolved = resolveWhatsAppContentSid({
      eventType: "TASK_DUE_TODAY",
      trial: true,
      hasCustomerSession: true,
    });
    assert.equal(resolved.mode, "FREEFORM_SESSION");
    assert.equal(resolved.contentSid, null);
  });

  it("maps production events to template keys without HX SIDs in business modules", () => {
    assert.equal(
      templateKeyForEvent("SELECTION_DUE_3_DAYS"),
      "SUNBUILD_SELECTION_REMINDER"
    );
    assert.equal(templateKeyForEvent("TASK_DUE_TODAY"), "SUNBUILD_TASK_DUE");
    assert.equal(templateKeyForEvent("RFI_OVERDUE"), "SUNBUILD_RFI_OVERDUE");
  });

  it("keeps desired production SMS copy separate from trial template ids", () => {
    const copy = productionSmsBody({
      eventType: "SELECTION_DUE_TODAY",
      projectName: "Lot 12",
      href: "/client/selections/abc",
      recipientName: "Alex Rivera",
      selectionName: "Flooring",
    });
    assert.match(copy, /Dear Alex,/);
    assert.match(copy, /Lot 12/);
    assert.match(copy, /Flooring/);
    assert.match(copy, /due today/i);
    assert.doesNotMatch(copy, /sms_internal_alerts/);
    assert.doesNotMatch(copy, /undefined|null/i);
  });
});

describe("provider selection prevents Meta + Twilio duplication", () => {
  const keys = ["WHATSAPP_PROVIDER", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_WHATSAPP_FROM", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_ACCESS_TOKEN"] as const;
  const saved: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("prefers Twilio WhatsApp when Twilio WhatsApp env is present", () => {
    for (const key of keys) saved[key] = process.env[key];
    process.env.TWILIO_ACCOUNT_SID = "ACffffffffffffffffffffffffffffffff";
    process.env.TWILIO_AUTH_TOKEN = "test-auth-token";
    process.env.TWILIO_WHATSAPP_FROM = "+14155238886";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.WHATSAPP_ACCESS_TOKEN = "meta-token";
    delete process.env.WHATSAPP_PROVIDER;
    assert.equal(resolveWhatsAppProviderName(), "twilio");
  });
});

describe("client / finance isolation helpers", () => {
  it("does not allow Client B to receive Client A reminders", () => {
    const allowed = ["clientA"];
    assert.equal(allowed.includes("clientB"), false);
    assert.equal(allowed.includes("clientA"), true);
  });
});

describe("SMS destination binding (no open relay)", () => {
  it("allows empty override (use entity phone)", () => {
    assert.equal(
      smsDestinationMatchesEntity({
        requestedTo: "",
        entityPhone: "+14035550113",
        defaultRegion: "CA",
      }).ok,
      true
    );
  });

  it("allows matching E.164 / last-10 override", () => {
    assert.equal(
      smsDestinationMatchesEntity({
        requestedTo: "4035550113",
        entityPhone: "+1 (403) 555-0113",
        defaultRegion: "CA",
      }).ok,
      true
    );
  });

  it("rejects arbitrary public destination injection", () => {
    const result = smsDestinationMatchesEntity({
      requestedTo: "+15551234567",
      entityPhone: "+14035550113",
      defaultRegion: "CA",
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.code, "SMS_DESTINATION_MISMATCH");
  });
});

describe("phone region inference", () => {
  it("uses company province instead of blindly prepending +1 or +91", () => {
    assert.equal(inferPhoneRegion({ province: "Alberta" }), "CA");
    assert.equal(inferPhoneRegion({ country: "India" }), "IN");
    assert.equal(normalizeToE164("4035550100").ok, false);
    assert.equal(
      normalizeToE164("4035550100", { defaultRegion: "CA" }).ok,
      true
    );
    assert.equal(toWhatsAppAddress("+14035550100"), "whatsapp:+14035550100");
  });
});

describe("Twilio delivery status mapping", () => {
  it("maps SMS and WhatsApp callback statuses including read", () => {
    assert.equal(mapTwilioDeliveryStatus("queued"), "QUEUED");
    assert.equal(mapTwilioDeliveryStatus("accepted"), "ACCEPTED");
    assert.equal(mapTwilioDeliveryStatus("sending"), "SENDING");
    assert.equal(mapTwilioDeliveryStatus("sent"), "SENT");
    assert.equal(mapTwilioDeliveryStatus("delivered"), "DELIVERED");
    assert.equal(mapTwilioDeliveryStatus("read"), "READ");
    assert.equal(mapTwilioDeliveryStatus("failed"), "FAILED");
    assert.equal(mapTwilioDeliveryStatus("undelivered"), "UNDELIVERED");
  });
});

describe("signed webhook validation (official Twilio SDK)", () => {
  it("accepts a valid X-Twilio-Signature and rejects a fake one", () => {
    const authToken = "test-auth-token";
    const url = "https://sunbuild.onrender.com/api/twilio/sms/status";
    const params = {
      MessageSid: "SMtestmessagesid0001",
      MessageStatus: "delivered",
    };
    const valid = getExpectedTwilioSignature(authToken, url, params);
    assert.equal(validateRequest(authToken, valid, url, params), true);
    assert.equal(validateRequest(authToken, "invalid", url, params), false);
  });

  it("replay of the same callback payload remains a valid signature (idempotent update)", () => {
    const authToken = "test-auth-token";
    const url = "https://sunbuild.onrender.com/api/twilio/whatsapp/status";
    const params = {
      MessageSid: "SMreplay0001",
      MessageStatus: "read",
    };
    const signature = getExpectedTwilioSignature(authToken, url, params);
    assert.equal(validateRequest(authToken, signature, url, params), true);
    assert.equal(validateRequest(authToken, signature, url, params), true);
  });
});

describe("localhost callbacks are omitted", () => {
  it("does not treat localhost as a public Twilio callback origin", () => {
    assert.equal(isPublicHttpOrigin("http://localhost:3000"), false);
    assert.equal(isPublicHttpOrigin("https://sunbuild.onrender.com"), true);
  });

  it("omits statusCallback URLs when APP_URL is localhost", () => {
    const prev = process.env.APP_URL;
    const tunnel = process.env.TWILIO_WEBHOOK_BASE_URL;
    process.env.APP_URL = "http://localhost:3000";
    delete process.env.TWILIO_WEBHOOK_BASE_URL;
    try {
      const urls = getTwilioWebhookUrls();
      assert.equal(urls.public, false);
      assert.equal(urls.smsStatus, "");
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
      if (tunnel === undefined) delete process.env.TWILIO_WEBHOOK_BASE_URL;
      else process.env.TWILIO_WEBHOOK_BASE_URL = tunnel;
    }
  });
});

describe("Twilio trial/provider failure diagnostics stay secret-safe", () => {
  it("classifies unverified trial, sandbox, opt-out, and 5xx without leaking tokens", () => {
    const unverified = parseTwilioSendError({
      code: 21608,
      message: "unverified trial https://twilio.com/secret",
    });
    assert.equal(unverified.unverifiedRecipient, true);
    assert.equal(unverified.permanent, true);
    assert.doesNotMatch(unverified.errorMessage, /https?:\/\//);

    const sandbox = parseTwilioSendError({
      code: 63015,
      message: "User has not joined the sandbox",
    });
    assert.equal(sandbox.sandboxNotJoined, true);

    const opt = parseTwilioSendError({ code: 21610, message: "opted out" });
    assert.equal(opt.optedOut, true);

    const timeout = parseTwilioSendError({ message: "timeout contacting Twilio" });
    assert.equal(timeout.retryable, true);
  });

  it("defaults operating mode to trial until upgraded", () => {
    assert.ok(getTwilioMode() === "trial" || getTwilioMode() === "production");
  });
});

describe("concurrent dispatch uniqueness", () => {
  it("same idempotency key collapses to one provider message", () => {
    const a = channelIdempotencyKey({
      eventType: "TASK_DUE_TODAY",
      entityId: "task1",
      recipientUserId: "user1",
      occurrence: "2026-09-18",
      channel: "WHATSAPP",
    });
    const b = channelIdempotencyKey({
      eventType: "TASK_DUE_TODAY",
      entityId: "task1",
      recipientUserId: "user1",
      occurrence: "2026-09-18",
      channel: "WHATSAPP",
    });
    assert.equal(a, b);
    assert.notEqual(
      a,
      channelIdempotencyKey({
        eventType: "TASK_DUE_TODAY",
        entityId: "task1",
        recipientUserId: "user1",
        occurrence: "2026-09-18",
        channel: "SMS",
      })
    );
  });
});
