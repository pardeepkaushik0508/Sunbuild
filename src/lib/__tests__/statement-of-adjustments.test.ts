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
  it("matches reference-style arithmetic with promo credit and deposits", () => {
    const result = calculateStatementOfAdjustments({
      baseHomePrice: 1_000_000,
      gstRate: 0.05,
      promoCreditAdjustment: 54_761.9,
      changeOrders: [
        {
          id: "1",
          title: "CO1",
          amount: 80_000,
          status: ChangeOrderStatus.APPROVED,
          createdAt: new Date("2026-01-01"),
        },
        {
          id: "2",
          title: "CO2",
          amount: 40_000,
          status: ChangeOrderStatus.APPROVED,
          createdAt: new Date("2026-01-02"),
        },
        {
          id: "3",
          title: "Pending",
          amount: 99_999,
          status: ChangeOrderStatus.PENDING_CLIENT,
          createdAt: new Date("2026-01-03"),
        },
        {
          id: "4",
          title: "Rejected",
          amount: 10_000,
          status: ChangeOrderStatus.REJECTED,
          createdAt: new Date("2026-01-04"),
        },
      ],
      deposits: [
        {
          id: "d1",
          label: "Deposit 1",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
        {
          id: "d2",
          label: "Deposit 2",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
        {
          id: "d3",
          label: "Deposit 3",
          amount: 50_000,
          status: DepositStatus.RECEIVED,
        },
        {
          id: "d4",
          label: "Pending deposit",
          amount: 25_000,
          status: DepositStatus.PENDING,
        },
      ],
    });

    assert.equal(result.changeOrders.length, 2);
    assert.equal(result.changeOrdersSubtotal, 120_000);
    assert.equal(result.promoCreditAdjustment, 54_761.9);
    assert.equal(result.changeOrdersTotalWithoutGst, 65_238.1);
    assert.equal(result.totalClosingPrice, 1_065_238.1);
    assert.equal(result.totalGst, 53_261.91);
    assert.equal(result.totalSalesPrice, 1_118_500.01);
    assert.equal(result.depositsToDate, 150_000);
    assert.equal(result.cashToClose, 968_500.01);
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
