/**
 * Statement of Adjustments calculation tests (fixture arithmetic).
 * Run: npx tsx --test src/lib/__tests__/statement-of-adjustments.test.ts
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ChangeOrderStatus, DepositStatus } from "@prisma/client";
import { calculateStatementOfAdjustments } from "../statement-of-adjustments/calculate";
import { formatSoaCurrency } from "../statement-of-adjustments/money";

describe("Statement of Adjustments calculations", () => {
  it("matches Sunview client reference arithmetic with GST 5%", () => {
    const result = calculateStatementOfAdjustments({
      baseHomePrice: 1_103_661.9,
      gstRate: 0.05,
      promoCreditAdjustment: 54_761.9,
      changeOrders: [
        {
          id: "1",
          title: "CO1",
          amount: 106_154.04,
          status: ChangeOrderStatus.APPROVED,
          createdAt: new Date("2026-01-01"),
        },
      ],
      deposits: [
        {
          id: "d1",
          label: "Deposits 1",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
        {
          id: "d2",
          label: "Deposits 2",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
        {
          id: "d3",
          label: "Deposits 3",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
      ],
    });

    assert.equal(result.changeOrders.length, 1);
    assert.equal(result.changeOrders[0].label, "Change Order # 1");
    assert.equal(result.changeOrdersSubtotal, 106_154.04);
    assert.equal(result.promoCreditAdjustment, 54_761.9);
    assert.equal(result.changeOrdersTotalWithoutGst, 51_392.14);
    assert.equal(result.totalClosingPrice, 1_155_054.04);
    assert.equal(result.totalGst, 57_752.7);
    assert.equal(result.totalSalesPrice, 1_212_806.74);
    assert.equal(result.depositsToDate, 150_000);
    assert.equal(result.cashToClose, 1_062_806.74);
  });

  it("applies GST when rate provided and filters pending COs/deposits", () => {
    const result = calculateStatementOfAdjustments({
      baseHomePrice: 1_000_000,
      gstRate: 0.05,
      promoCreditAdjustment: 0,
      changeOrders: [
        {
          id: "1",
          title: "CO1",
          amount: 100_000,
          status: ChangeOrderStatus.APPROVED,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "2",
          title: "Pending",
          amount: 99_999,
          status: ChangeOrderStatus.PENDING_CLIENT,
          createdAt: new Date("2026-01-03"),
        },
      ],
      deposits: [
        {
          id: "d1",
          label: "Deposits 1",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
        {
          id: "d2",
          label: "Pending deposit",
          amount: 25_000,
          status: DepositStatus.PENDING,
        },
      ],
    });

    assert.equal(result.changeOrders.length, 1);
    assert.equal(result.totalClosingPrice, 1_100_000);
    assert.equal(result.totalGst, 55_000);
    assert.equal(result.totalSalesPrice, 1_155_000);
    assert.equal(result.depositsToDate, 50_000);
    assert.equal(result.cashToClose, 1_105_000);
  });

  it("handles zero change orders and deposits cleanly", () => {
    const result = calculateStatementOfAdjustments({
      baseHomePrice: 500_000,
      gstRate: 0.05,
      promoCreditAdjustment: 0,
      changeOrders: [],
      deposits: [],
    });
    assert.equal(result.changeOrdersSubtotal, 0);
    assert.equal(result.totalClosingPrice, 500_000);
    assert.equal(result.totalGst, 25_000);
    assert.equal(result.totalSalesPrice, 525_000);
    assert.equal(result.cashToClose, 525_000);
  });

  it("includes COMPLETED change orders as approved", () => {
    const result = calculateStatementOfAdjustments({
      baseHomePrice: 100,
      gstRate: 0.05,
      promoCreditAdjustment: 0,
      changeOrders: [
        {
          id: "c",
          title: "Done",
          amount: 50,
          status: ChangeOrderStatus.COMPLETED,
          createdAt: new Date(),
        },
      ],
      deposits: [],
    });
    assert.equal(result.changeOrders.length, 1);
    assert.equal(result.changeOrdersSubtotal, 50);
  });

  it("formats credits with leading minus", () => {
    assert.equal(formatSoaCurrency(150000, { asCredit: true }), "-$150,000.00");
  });
});
