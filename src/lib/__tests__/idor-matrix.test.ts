/**
 * Authorization / IDOR matrix documentation tests (logic-level).
 * These encode the intended denial matrix for major roles × resources.
 * Full HTTP IDOR suite requires seeded DB + session cookies in CI.
 *
 * Run: npx tsx --test src/lib/__tests__/idor-matrix.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import { roleHasCapability, type Capability } from "../authorization";
import { hasFinanceAccess } from "../permissions";

type Expect = "allow" | "deny";

function expectCap(role: Role, cap: Capability, expected: Expect) {
  const actual = roleHasCapability(role, cap);
  assert.equal(
    actual,
    expected === "allow",
    `${role} ${cap} expected ${expected}, got ${actual ? "allow" : "deny"}`
  );
}

describe("IDOR / privilege matrix (capability layer)", () => {
  it("client isolation of staff actions", () => {
    const staffOnly: Capability[] = [
      "manageLeads",
      "manageContracts",
      "manageTasks",
      "assignSubcontractors",
      "uploadDocuments",
      "publishPhotos",
      "manageSelectionsStaff",
      "manageChangeOrdersStaff",
      "uploadCompletion",
      "ceoApproveCompletion",
      "manageWarranty",
      "manageUsers",
    ];
    for (const cap of staffOnly) {
      expectCap(Role.CLIENT, cap, "deny");
      expectCap(Role.SUBCONTRACTOR, cap, "deny");
    }
  });

  it("subcontractor may update assigned work only (capability gates)", () => {
    expectCap(Role.SUBCONTRACTOR, "uploadPhotos", "allow");
    expectCap(Role.SUBCONTRACTOR, "manageRfis", "allow");
    expectCap(Role.SUBCONTRACTOR, "manageDailyLogs", "allow");
    expectCap(Role.SUBCONTRACTOR, "updateOwnOrAssignedTasks", "allow");
    expectCap(Role.SUBCONTRACTOR, "createWarranty", "deny");
  });

  it("finance boundary", () => {
    assert.equal(hasFinanceAccess(Role.OWNER, false), true);
    assert.equal(hasFinanceAccess(Role.BOOKKEEPER, false), true);
    assert.equal(hasFinanceAccess(Role.CEO, false), false);
    assert.equal(hasFinanceAccess(Role.CEO, true), false);
    assert.equal(hasFinanceAccess(Role.PROJECT_MANAGER, false), false);
    assert.equal(hasFinanceAccess(Role.PROJECT_MANAGER, true), true);
    assert.equal(hasFinanceAccess(Role.CLIENT, true), false);
  });

  it("PM cannot self-approve as CEO", () => {
    expectCap(Role.PROJECT_MANAGER, "ceoApproveCompletion", "deny");
    expectCap(Role.PROJECT_MANAGER, "uploadCompletion", "allow");
  });
});
