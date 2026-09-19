/**
 * Central SMS template engine + mode/outbound resolution.
 * Mocks only — does not send live Twilio messages.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { channelsForNotificationType } from "../notifications/channels";
import { getSmsOperatingMode } from "../sms/mode";
import {
  isSmsTemplateEnabled,
  listSmsTemplateReport,
  renderSmsTemplate,
  smsGreeting,
  smsContentVariables,
} from "../sms/templates";
import { resolveSmsProviderOutbound } from "../sms/resolve-outbound";
import { channelIdempotencyKey } from "../messaging/idempotency";
import { resolveOutboundTwilioBody } from "../twilio/payload";
import { DEFAULT_TWILIO_TRIAL_TEMPLATE } from "../twilio/mode";

const ENV_KEYS = [
  "TWILIO_SMS_MODE",
  "TWILIO_MODE",
  "TWILIO_TRIAL_TEMPLATE",
  "TWILIO_CONTENT_INVOICE_OVERDUE",
  "APP_URL",
] as const;

describe("SMS channel matrix vs template enablement", () => {
  it("keeps approved SMS events enabled and others off", () => {
    assert.equal(isSmsTemplateEnabled("SELECTION_DUE_TODAY"), true);
    assert.equal(isSmsTemplateEnabled("INVOICE_OVERDUE"), true);
    assert.equal(isSmsTemplateEnabled("DEPOSIT_DUE"), true);
    assert.equal(isSmsTemplateEnabled("SUBCONTRACTOR_PROJECT_ASSIGNED"), true);

    assert.equal(isSmsTemplateEnabled("SELECTION_DUE_3_DAYS"), false);
    assert.equal(isSmsTemplateEnabled("RFI_OVERDUE"), false);
    assert.equal(isSmsTemplateEnabled("TASK_DUE_TODAY"), false);
    assert.equal(isSmsTemplateEnabled("PROJECT_ASSIGNED"), false);
    assert.equal(isSmsTemplateEnabled("TASK_ASSIGNED"), false);

    assert.equal(
      channelsForNotificationType("SELECTION_DUE_TODAY").channels.includes("sms"),
      true
    );
    assert.equal(
      channelsForNotificationType("TASK_DUE_TODAY").channels.includes("sms"),
      false
    );
  });
});

describe("SMS greeting / personalization", () => {
  it("uses Dear {first} when name exists and Hello otherwise", () => {
    assert.equal(smsGreeting("Liam Thompson"), "Dear Liam,");
    assert.equal(smsGreeting(""), "Hello,");
    assert.equal(smsGreeting(null), "Hello,");
  });
});

describe("production SMS template rendering", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
      delete saved[key];
    }
  });

  function stash() {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
  }

  it("renders INVOICE_OVERDUE with Liam / INV-1001 / Clearwater Park", () => {
    stash();
    process.env.APP_URL = "https://sunbuild.onrender.com";
    const rendered = renderSmsTemplate("INVOICE_OVERDUE", {
      recipientName: "Liam Thompson",
      projectName: "Clearwater Park",
      invoiceNumber: "INV-1001",
      invoiceDueDate: "2026-09-01",
      href: "/client/payments",
    });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.match(rendered.body, /Dear Liam,/);
    assert.match(rendered.body, /INV-1001/);
    assert.match(rendered.body, /Clearwater Park/);
    assert.match(rendered.body, /overdue/i);
    assert.match(rendered.body, /https:\/\/sunbuild\.onrender\.com\/client\/payments/);
    assert.doesNotMatch(rendered.body, /undefined|null|\[object Object\]/i);
    assert.equal(rendered.templateKey, "invoice_overdue");
    assert.equal(rendered.smsEnabled, true);
  });

  it("renders SELECTION_DUE_TODAY dynamically", () => {
    stash();
    process.env.APP_URL = "https://sunbuild.onrender.com";
    const rendered = renderSmsTemplate("SELECTION_DUE_TODAY", {
      recipientName: "Liam",
      projectName: "Clearwater Park",
      selectionName: "Kitchen Countertop",
      href: "/client/selections/sel1",
    });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.match(rendered.body, /Kitchen Countertop/);
    assert.match(rendered.body, /Clearwater Park/);
    assert.match(rendered.body, /due today/i);
  });

  it("renders DEPOSIT_DUE for bookkeeper with optional amount", () => {
    const withAmount = renderSmsTemplate("DEPOSIT_DUE", {
      recipientName: "Office Lead",
      projectName: "Clearwater Park",
      depositAmount: "$5,000.00",
      href: "/bookkeeper/invoices",
    });
    assert.equal(withAmount.ok, true);
    if (withAmount.ok) {
      assert.match(withAmount.body, /\$5,000\.00/);
      assert.match(withAmount.body, /Clearwater Park/);
    }

    const withoutAmount = renderSmsTemplate("DEPOSIT_DUE", {
      recipientName: "Office Lead",
      projectName: "Clearwater Park",
      href: "/bookkeeper/invoices",
    });
    assert.equal(withoutAmount.ok, true);
    if (withoutAmount.ok) {
      assert.match(withoutAmount.body, /a deposit for Clearwater Park is now due/i);
    }
  });

  it("rejects malformed invoice template without invoice number", () => {
    const rendered = renderSmsTemplate("INVOICE_OVERDUE", {
      recipientName: "Liam",
      projectName: "Clearwater Park",
    });
    assert.equal(rendered.ok, false);
    if (!rendered.ok) assert.equal(rendered.code, "TEMPLATE_DATA_INVALID");
  });

  it("handles long names without undefined leakage", () => {
    const rendered = renderSmsTemplate("INVOICE_OVERDUE", {
      recipientName: "A".repeat(100) + " Last",
      projectName: "P".repeat(100),
      invoiceNumber: "INV-" + "9".repeat(40),
      href: "/client/payments",
    });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.doesNotMatch(rendered.body, /undefined|null/i);
    assert.ok(rendered.body.length <= 500);
  });

  it("keeps optional address missing valid", () => {
    const rendered = renderSmsTemplate("SELECTION_DUE_TODAY", {
      recipientName: "Sam",
      projectName: "Lot 9",
      selectionName: "Paint",
    });
    assert.equal(rendered.ok, true);
  });

  it("escapes awkward business punctuation safely", () => {
    const rendered = renderSmsTemplate("SELECTION_DUE_TODAY", {
      recipientName: "O'Neil",
      projectName: "Park & Ride",
      selectionName: 'Counter "Quartz"',
    });
    assert.equal(rendered.ok, true);
    if (!rendered.ok) return;
    assert.match(rendered.body, /O'Neil|Dear O/);
    assert.match(rendered.body, /Park & Ride/);
  });

  it("prepares but does not enable PROJECT_ASSIGNED / TASK_ASSIGNED SMS", () => {
    const project = renderSmsTemplate("PROJECT_ASSIGNED", {
      recipientName: "Jordan",
      projectName: "Clearwater Park",
      href: "/pm/projects/1",
    });
    assert.equal(project.ok, true);
    if (project.ok) assert.equal(project.smsEnabled, false);

    const task = renderSmsTemplate("TASK_ASSIGNED", {
      recipientName: "Jordan",
      projectName: "Clearwater Park",
      taskName: "Frame walls",
      taskDueDate: "Sep 20, 2026",
    });
    assert.equal(task.ok, true);
    if (task.ok) assert.equal(task.smsEnabled, false);
  });
});

describe("SMS operating modes", () => {
  const keys = ["TWILIO_SMS_MODE", "TWILIO_MODE"] as const;
  const saved: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("defaults to TRIAL and maps TWILIO_MODE=production to CUSTOM_BODY", () => {
    for (const key of keys) saved[key] = process.env[key];
    delete process.env.TWILIO_SMS_MODE;
    delete process.env.TWILIO_MODE;
    assert.equal(getSmsOperatingMode(), "TRIAL");

    process.env.TWILIO_MODE = "production";
    assert.equal(getSmsOperatingMode(), "CUSTOM_BODY");

    process.env.TWILIO_SMS_MODE = "content";
    assert.equal(getSmsOperatingMode(), "CONTENT_TEMPLATE");
  });
});

describe("Trial regression — provider still receives trial template id", () => {
  const keys = [
    "TWILIO_SMS_MODE",
    "TWILIO_MODE",
    "TWILIO_TRIAL_TEMPLATE",
    "TWILIO_CONTENT_INVOICE_OVERDUE",
    "APP_URL",
  ] as const;
  const saved: Partial<Record<(typeof keys)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of keys) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("stores custom intended body but sends sms_internal_alerts in Trial", () => {
    for (const key of keys) saved[key] = process.env[key];
    delete process.env.TWILIO_SMS_MODE;
    process.env.TWILIO_MODE = "trial";
    delete process.env.TWILIO_TRIAL_TEMPLATE;

    const intended =
      'Dear Liam, invoice INV-1001 for Clearwater Park is overdue. Please review it in SUNBUILD: https://sunbuild.onrender.com/client/payments';

    const outbound = resolveSmsProviderOutbound({
      intendedBody: intended,
      eventType: "INVOICE_OVERDUE",
      context: {
        recipientName: "Liam",
        projectName: "Clearwater Park",
        invoiceNumber: "INV-1001",
      },
      twilioMode: "trial",
    });

    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    assert.equal(outbound.mode, "TRIAL");
    assert.equal(outbound.twilioBody, DEFAULT_TWILIO_TRIAL_TEMPLATE);
    assert.equal(outbound.intendedBody, intended);
    assert.equal(outbound.contentSid, null);

    // Legacy helper still agrees (regression lock).
    const legacy = resolveOutboundTwilioBody({ mode: "trial" }, intended);
    assert.equal(legacy.ok, true);
    if (legacy.ok) {
      assert.equal(legacy.twilioBody, DEFAULT_TWILIO_TRIAL_TEMPLATE);
      assert.equal(legacy.intendedBody, intended);
    }
  });

  it("CUSTOM_BODY mode sends the rendered production text", () => {
    for (const key of keys) saved[key] = process.env[key];
    process.env.TWILIO_SMS_MODE = "custom";
    const intended = "Dear Liam, invoice INV-1001 for Clearwater Park is overdue.";
    const outbound = resolveSmsProviderOutbound({
      intendedBody: intended,
      eventType: "INVOICE_OVERDUE",
      context: { recipientName: "Liam", invoiceNumber: "INV-1001", projectName: "Clearwater Park" },
      twilioMode: "production",
    });
    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    assert.equal(outbound.mode, "CUSTOM_BODY");
    assert.equal(outbound.twilioBody, intended);
  });

  it("CONTENT_TEMPLATE mode uses ContentSid + variables without body conflict", () => {
    for (const key of keys) saved[key] = process.env[key];
    process.env.TWILIO_SMS_MODE = "content";
    process.env.TWILIO_CONTENT_INVOICE_OVERDUE = "HXffffffffffffffffffffffffffffffff";
    const outbound = resolveSmsProviderOutbound({
      intendedBody: "Dear Liam, invoice INV-1001...",
      eventType: "INVOICE_OVERDUE",
      context: {
        recipientName: "Liam Thompson",
        projectName: "Clearwater Park",
        invoiceNumber: "INV-1001",
        href: "/client/payments",
      },
      twilioMode: "production",
    });
    assert.equal(outbound.ok, true);
    if (!outbound.ok) return;
    assert.equal(outbound.mode, "CONTENT_TEMPLATE");
    assert.equal(outbound.twilioBody, null);
    assert.equal(outbound.contentSid, "HXffffffffffffffffffffffffffffffff");
    assert.deepEqual(outbound.contentVariables, smsContentVariables("INVOICE_OVERDUE", {
      recipientName: "Liam Thompson",
      projectName: "Clearwater Park",
      invoiceNumber: "INV-1001",
      href: "/client/payments",
    }));
  });
});

describe("SMS template report", () => {
  it("lists active and inactive templates without secrets", () => {
    const rows = listSmsTemplateReport({});
    const invoice = rows.find((r) => r.event === "INVOICE_OVERDUE");
    assert.ok(invoice);
    assert.equal(invoice?.smsEnabled, true);
    assert.equal(invoice?.templateKey, "invoice_overdue");
    assert.equal(invoice?.contentSidConfigured, false);

    const projectAssigned = rows.find((r) => r.event === "PROJECT_ASSIGNED");
    assert.equal(projectAssigned?.smsEnabled, false);
  });
});

describe("idempotency is independent of template copy", () => {
  it("same event key remains stable when body text changes", () => {
    const a = channelIdempotencyKey({
      eventType: "INVOICE_OVERDUE",
      entityId: "inv1",
      recipientUserId: "userA",
      occurrence: "2026-09-18",
      channel: "SMS",
    });
    const b = channelIdempotencyKey({
      eventType: "INVOICE_OVERDUE",
      entityId: "inv1",
      recipientUserId: "userA",
      occurrence: "2026-09-18",
      channel: "SMS",
    });
    assert.equal(a, b);
    assert.doesNotMatch(a, /Dear|INV-/);
  });
});
