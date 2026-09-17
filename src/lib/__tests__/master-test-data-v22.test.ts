/**
 * Master Test Data v2.2 gates — activation validation + SOA fixture arithmetic.
 * Run: npx tsx --test src/lib/__tests__/master-test-data-v22.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChangeOrderStatus, DepositStatus } from "@prisma/client";
import {
  validateContractActivation,
  validateDepositLadder,
  validatePossessionDate,
  canadaWideHolidayName,
} from "../contracts/activation-validation";
import { calculateContractTotals } from "../contracts/contracts";
import {
  authorizedSignatoryName,
  namesMatch,
} from "../contracts/signatory";
import { calculateStatementOfAdjustments } from "../statement-of-adjustments/calculate";

describe("Contract activation gates (SV-1004)", () => {
  it("rejects Saturday possession (3 Oct 2026)", () => {
    const issue = validatePossessionDate(new Date("2026-10-03T12:00:00Z"));
    assert.ok(issue);
    assert.equal(issue!.code, "POSSESSION_DATE");
    assert.match(issue!.message, /weekend/i);
  });

  it("rejects National Day for Truth and Reconciliation (30 Sep)", () => {
    const issue = validatePossessionDate(new Date("2026-09-30T12:00:00Z"));
    assert.ok(issue);
    assert.equal(canadaWideHolidayName(new Date("2026-09-30T12:00:00Z")), 
      "National Day for Truth and Reconciliation");
    assert.match(issue!.message, /Truth and Reconciliation/i);
  });

  it("accepts Friday 2 Oct 2026 possession", () => {
    assert.equal(validatePossessionDate(new Date("2026-10-02T18:00:00Z")), null);
  });

  it("fails deposit ladder when sum does not equal total (SV-1004)", () => {
    const issue = validateDepositLadder({
      totalPurchasePrice: 655000,
      deposits: [{ label: "bad ladder", amount: 540000 }],
    });
    assert.ok(issue);
    assert.equal(issue!.code, "DEPOSIT_LADDER");
    assert.match(issue!.message, /540000\.00/);
  });

  it("passes deposit ladder when deposits + balance equal total (SV-1001)", () => {
    const issue = validateDepositLadder({
      totalPurchasePrice: 588000,
      deposits: [
        { amount: 25000 },
        { amount: 25000 },
        { amount: 20000 },
        { amount: 20000 },
        { amount: 20000 },
        { amount: 478000 },
      ],
    });
    assert.equal(issue, null);
  });

  it("blocks activation when both SV-1004 errors are present", () => {
    const issues = validateContractActivation({
      totalPurchasePrice: 655000,
      deposits: [{ amount: 540000 }],
      possessionDate: new Date("2026-10-03T12:00:00Z"),
    });
    assert.equal(issues.length, 2);
    assert.ok(issues.some((i) => i.code === "DEPOSIT_LADDER"));
    assert.ok(issues.some((i) => i.code === "POSSESSION_DATE"));
  });
});

describe("Purchase agreement totals (allowances not additive)", () => {
  it("matches PC-1001 price build-up", () => {
    const totals = calculateContractTotals({
      basePrice: 535000,
      allowanceTotal: 69500,
      upgradesTotal: 25000,
      discountsTotal: 0,
      taxRate: 5,
    });
    assert.equal(totals.subtotal, 560000);
    assert.equal(totals.taxAmount, 28000);
    assert.equal(totals.totalContractPrice, 588000);
    assert.equal(totals.allowanceTotal, 69500);
  });
});

describe("Authorized signatory", () => {
  it("uses buyer 1 as authorized signatory", () => {
    assert.equal(
      authorizedSignatoryName({
        buyerFirstName: "Liam",
        buyerLastName: "Thompson",
      }),
      "Liam Thompson"
    );
    assert.equal(namesMatch("  liam   thompson ", "Liam Thompson"), true);
    assert.equal(namesMatch("Sarah Thompson", "Liam Thompson"), false);
  });
});

describe("SOA fixture arithmetic (SV-1001 §14)", () => {
  it("matches cash to close with CO prepayments", () => {
    const result = calculateStatementOfAdjustments({
      baseHomePrice: 560000,
      gstRate: 0.05,
      promoCreditAdjustment: 0,
      changeOrderPrepayments: 15402.5,
      changeOrders: [
        {
          id: "co2",
          title: "CO-1002",
          amount: 7050,
          status: ChangeOrderStatus.COMPLETED,
          createdAt: new Date("2026-06-01"),
        },
        {
          id: "co4",
          title: "CO-1004",
          amount: 12750,
          status: ChangeOrderStatus.COMPLETED,
          createdAt: new Date("2026-07-01"),
        },
        {
          id: "co8",
          title: "CO-1008",
          amount: 1500,
          status: ChangeOrderStatus.APPROVED,
          createdAt: new Date("2026-09-01"),
        },
        {
          id: "pending",
          title: "CO-1001",
          amount: 4500,
          status: ChangeOrderStatus.PENDING_CLIENT,
          createdAt: new Date("2026-08-01"),
        },
      ],
      deposits: [
        { id: "1", label: "D1", amount: 25000, status: DepositStatus.RECEIVED },
        { id: "2", label: "D2", amount: 25000, status: DepositStatus.RECEIVED },
        { id: "3", label: "D3", amount: 20000, status: DepositStatus.RECEIVED },
        { id: "4", label: "D4", amount: 20000, status: DepositStatus.OVERDUE },
        { id: "5", label: "D5", amount: 20000, status: DepositStatus.PENDING },
      ],
    });

    assert.equal(result.changeOrdersSubtotal, 21300);
    assert.equal(result.totalClosingPrice, 581300);
    assert.equal(result.totalGst, 29065);
    assert.equal(result.totalSalesPrice, 610365);
    assert.equal(result.depositsToDate, 70000);
    assert.equal(result.changeOrderPrepayments, 15402.5);
    assert.equal(result.cashToClose, 524962.5);
  });
});
