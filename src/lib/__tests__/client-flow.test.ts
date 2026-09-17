/**
 * Client portal household flow — Master Test Data v2.2 §4 / §8 / §11 / §19.
 * Run: npx tsx --test src/lib/__tests__/client-flow.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChangeOrderStatus, ContractStatus, DepositStatus } from "@prisma/client";
import {
  authorizedSignatoryName,
  namesMatch,
} from "../contracts/signatory";
import {
  clientChangeOrderLabel,
  clientLifecycleStatusLabel,
  depositPaymentBadge,
  isApprovedChangeOrder,
  isDeniedChangeOrder,
  isPendingClientChangeOrder,
  isWarrantyCoverageActive,
  parseChangeOrderClientTotal,
} from "../client/flow";

describe("household authorized signatory (§4.3)", () => {
  it("binds Thompson COs to Liam, not Sarah", () => {
    const expected = authorizedSignatoryName({
      buyerFirstName: "Liam",
      buyerLastName: "Thompson",
    });
    assert.equal(expected, "Liam Thompson");
    assert.equal(namesMatch("Liam Thompson", expected!), true);
    assert.equal(namesMatch("Sarah Thompson", expected!), false);
  });

  it("binds Patel CO-2001 to Rahul only", () => {
    const expected = authorizedSignatoryName({
      buyerFirstName: "Rahul",
      buyerLastName: "Patel",
    });
    assert.equal(expected, "Rahul Patel");
    assert.equal(namesMatch("Purvi Patel", expected!), false);
    assert.equal(namesMatch("rahul  patel", expected!), true);
  });
});

describe("change order client states (§11)", () => {
  it("groups complete + approved as approved, declined as denied", () => {
    assert.equal(isPendingClientChangeOrder(ChangeOrderStatus.PENDING_CLIENT), true);
    assert.equal(isApprovedChangeOrder(ChangeOrderStatus.APPROVED), true);
    assert.equal(isApprovedChangeOrder(ChangeOrderStatus.COMPLETED), true);
    assert.equal(isDeniedChangeOrder(ChangeOrderStatus.REJECTED), true);
    assert.equal(isApprovedChangeOrder(ChangeOrderStatus.DRAFT), false);
    assert.equal(clientChangeOrderLabel(ChangeOrderStatus.COMPLETED), "COMPLETE");
    assert.equal(clientChangeOrderLabel(ChangeOrderStatus.REJECTED), "DENIED");
  });

  it("shows GST-inclusive total from the Clause 12 breakdown", () => {
    const parsed = parseChangeOrderClientTotal(
      "Sent to client. Lines $4250.00 + admin $250.00 + GST $225.00 = $4725.00.",
      4500
    );
    assert.equal(parsed.total, 4725);
    assert.equal(parsed.gst, 225);
  });
});

describe("deposit ladder badges (§8)", () => {
  it("marks received, overdue, and scheduled lines", () => {
    assert.equal(depositPaymentBadge(DepositStatus.RECEIVED).label, "Received");
    assert.equal(depositPaymentBadge(DepositStatus.OVERDUE).tone, "danger");
    assert.equal(
      depositPaymentBadge(DepositStatus.PENDING, new Date("2099-01-01")).label,
      "Scheduled"
    );
  });
});

describe("warranty coverage (§19)", () => {
  it("stays closed until possession, then open through the statutory end", () => {
    const sim = new Date("2026-09-17T12:00:00-06:00");
    assert.equal(
      isWarrantyCoverageActive({
        warrantyStart: new Date("2026-10-02"),
        warrantyEnd: new Date("2036-10-02"),
        now: sim,
      }),
      false
    );
    assert.equal(
      isWarrantyCoverageActive({
        warrantyStart: new Date("2026-10-02"),
        warrantyEnd: new Date("2036-10-02"),
        now: new Date("2026-10-02T18:00:00Z"),
      }),
      true
    );
    assert.equal(
      isWarrantyCoverageActive({
        warrantyStart: new Date("2026-10-02"),
        warrantyEnd: new Date("2027-10-02"),
        now: new Date("2028-01-01"),
      }),
      false
    );
  });
});

describe("lifecycle labels", () => {
  it("uses conditions period and under-review instead of generic PRE_CONSTRUCTION", () => {
    assert.equal(
      clientLifecycleStatusLabel({
        projectStatus: "PRE_CONSTRUCTION",
        contractStatus: ContractStatus.IN_REVIEW,
        openPurchaserConditions: 0,
      }),
      "Contract under review"
    );
    assert.equal(
      clientLifecycleStatusLabel({
        projectStatus: "PRE_CONSTRUCTION",
        contractStatus: ContractStatus.EXECUTED,
        openPurchaserConditions: 1,
      }),
      "Conditions period"
    );
  });
});
