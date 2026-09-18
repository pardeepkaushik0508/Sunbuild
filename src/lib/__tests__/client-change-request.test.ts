import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Role } from "@prisma/client";
import {
  channelsForNotificationType,
  notificationHrefIsSafe,
  warrantyTicketHref,
} from "../notifications/channels";
import { hasFinanceAccess, ROLE_HOME, canAccessProject } from "../permissions";
import { roleHasCapability } from "../authorization";
import {
  closingDateForProjectId,
  isYear2027,
} from "../projects/closing-dates-2027";
import { subcontractorDirectory, NAMED_SUBCONTRACTORS } from "../users/subcontractor-directory";

describe("notification channel matrix", () => {
  it("sends the approved mix and never emails", () => {
    assert.deepEqual(channelsForNotificationType("SELECTION_DUE_IN_3_DAYS").channels, [
      "in_app",
      "whatsapp",
    ]);
    assert.deepEqual(channelsForNotificationType("SELECTION_DUE_TODAY").channels, [
      "in_app",
      "whatsapp",
      "sms",
    ]);
    assert.deepEqual(channelsForNotificationType("RFI_OVERDUE").channels, [
      "in_app",
      "whatsapp",
    ]);
    assert.deepEqual(channelsForNotificationType("INVOICE_OVERDUE").channels, [
      "in_app",
      "sms",
    ]);
    assert.deepEqual(channelsForNotificationType("DEPOSIT_DUE").channels, [
      "in_app",
      "sms",
    ]);
    assert.deepEqual(channelsForNotificationType("TASK_DUE_TODAY").channels, [
      "in_app",
      "whatsapp",
    ]);
    assert.equal(
      channelsForNotificationType("RANDOM_EVENT").channels.includes("whatsapp"),
      false
    );
  });

  it("rejects unsafe notification links", () => {
    assert.equal(notificationHrefIsSafe("/client/payments"), true);
    assert.equal(notificationHrefIsSafe("https://evil.example"), false);
    assert.equal(notificationHrefIsSafe("//evil.example"), false);
  });
});

describe("Service Coordinator RBAC", () => {
  it("homes to /service and cannot receive finance access", () => {
    assert.equal(ROLE_HOME.SERVICE_COORDINATOR, "/service");
    assert.equal(hasFinanceAccess(Role.SERVICE_COORDINATOR, true), false);
    assert.equal(hasFinanceAccess(Role.CEO, true), false);
    assert.equal(roleHasCapability(Role.SERVICE_COORDINATOR, "manageWarranty"), true);
    assert.equal(roleHasCapability(Role.SERVICE_COORDINATOR, "manageUsers"), false);
    assert.equal(
      roleHasCapability(Role.SERVICE_COORDINATOR, "manageStatementOfAdjustments"),
      false
    );
    assert.equal(warrantyTicketHref("SERVICE_COORDINATOR", "abc"), "/service/warranty/abc");
    assert.equal(warrantyTicketHref("CLIENT", "abc"), "/client/warranty/abc");
  });

  it("does not get company-wide project access by default", () => {
    assert.equal(
      canAccessProject(Role.SERVICE_COORDINATOR, { isAssigned: false }),
      false
    );
    assert.equal(
      canAccessProject(Role.SERVICE_COORDINATOR, { isAssigned: true }),
      true
    );
    assert.equal(canAccessProject(Role.CLIENT, { isAssigned: false, isBuyer: true }), true);
    assert.equal(canAccessProject(Role.SUBCONTRACTOR, { isAssigned: false }), false);
  });
});

describe("2027 closing-date mapping", () => {
  it("is deterministic and always in 2027", () => {
    const a = closingDateForProjectId("proj_abc");
    const b = closingDateForProjectId("proj_abc");
    assert.equal(a.toISOString(), b.toISOString());
    assert.equal(isYear2027(a), true);
    const other = closingDateForProjectId("proj_xyz");
    assert.equal(other.getUTCFullYear(), 2027);
  });
});

describe("subcontractor directory source data", () => {
  it("contains the documented 34 vendors and named people", () => {
    assert.equal(subcontractorDirectory().length, 34);
    assert.equal(NAMED_SUBCONTRACTORS[0]?.email, "dev@bowriverframing.ca");
    assert.ok(subcontractorDirectory().some((v) => v.company === "Prairie Earthworks"));
  });
});
