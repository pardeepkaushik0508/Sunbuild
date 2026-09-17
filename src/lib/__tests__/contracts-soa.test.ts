/**
 * Comprehensive tests for Purchase Contracts and Schedule of Allowances (SOA)
 * Run: npx tsx --test src/lib/__tests__/contracts-soa.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Role, AllowanceItemStatus } from "@prisma/client";
import { roleHasCapability } from "../authorization";
import {
  calculateContractTotals,
  calculateSoaTotals,
  roundMoney,
} from "../contracts/contracts";
import { extractContractData } from "../contracts/contract-extractor";
import { analyzeSoaItems, suggestAllowanceCategory } from "../contracts/soa-recommendations";

describe("Contracts & SOA Capabilities and Permissions", () => {
  it("allows Sales Manager, Owner, and Operations Admin to manage contracts and SOA", () => {
    assert.equal(roleHasCapability(Role.SALES_MANAGER, "manageContracts"), true);
    assert.equal(roleHasCapability(Role.SALES_MANAGER, "manageSoa"), true);

    assert.equal(roleHasCapability(Role.OWNER, "manageContracts"), true);
    assert.equal(roleHasCapability(Role.OWNER, "manageSoa"), true);

    assert.equal(roleHasCapability(Role.OPERATIONS_ADMIN, "manageContracts"), true);
    assert.equal(roleHasCapability(Role.OPERATIONS_ADMIN, "manageSoa"), true);
  });

  it("denies CEO money-bearing SOA capabilities (Master Test Data v2.2)", () => {
    assert.equal(roleHasCapability(Role.CEO, "manageContracts"), true);
    assert.equal(roleHasCapability(Role.CEO, "manageSoa"), false);
    assert.equal(roleHasCapability(Role.CEO, "viewStatementOfAdjustments"), false);
    assert.equal(roleHasCapability(Role.CEO, "manageStatementOfAdjustments"), false);
  });

  it("strictly bars Project Managers, Clients, and Subcontractors from managing contracts or SOA", () => {
    assert.equal(roleHasCapability(Role.PROJECT_MANAGER, "manageContracts"), false);
    assert.equal(roleHasCapability(Role.PROJECT_MANAGER, "manageSoa"), false);

    assert.equal(roleHasCapability(Role.CLIENT, "manageContracts"), false);
    assert.equal(roleHasCapability(Role.CLIENT, "manageSoa"), false);

    assert.equal(roleHasCapability(Role.SUBCONTRACTOR, "manageContracts"), false);
    assert.equal(roleHasCapability(Role.SUBCONTRACTOR, "manageSoa"), false);
  });
});

describe("Authoritative Monetary & Contract Calculation", () => {
  it("rounds money authoritatively and avoids floating point drift", () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3);
    assert.equal(roundMoney(1234.5678), 1234.57);
    assert.equal(roundMoney(0.004), 0);
  });

  it("calculates contract totals correctly with GST math (allowances not additive)", () => {
    const totals = calculateContractTotals({
      basePrice: 650000,
      allowanceTotal: 60000,
      upgradesTotal: 15000,
      discountsTotal: 5000,
      taxRate: 5.0,
    });

    // Subtotal = 650,000 + 15,000 = 665,000 (allowance tracked, not added)
    // Tax (5%) = 33,250
    // Total = 665,000 + 33,250 − 5,000 rebate = 693,250
    assert.equal(totals.basePrice, 650000);
    assert.equal(totals.allowanceTotal, 60000);
    assert.equal(totals.upgradesTotal, 15000);
    assert.equal(totals.discountsTotal, 5000);
    assert.equal(totals.subtotal, 665000);
    assert.equal(totals.taxAmount, 33250);
    assert.equal(totals.totalContractPrice, 693250);
  });

  it("handles zero or null values safely in contract calculation", () => {
    const totals = calculateContractTotals({
      basePrice: 500000,
      allowanceTotal: 0,
      taxRate: 5.0,
    });

    assert.equal(totals.taxAmount, 25000);
    assert.equal(totals.totalContractPrice, 525000);
  });
});

describe("Schedule of Allowances (SOA) Accumulation", () => {
  it("calculates total allowance, committed, remaining, and overage correctly", () => {
    const items = [
      {
        id: "1",
        category: "Flooring",
        name: "Hardwood",
        amount: 15000,
        actualCost: 14000,
        status: AllowanceItemStatus.SELECTED,
      },
      {
        id: "2",
        category: "Kitchen Cabinetry",
        name: "Custom Cabinets",
        amount: 25000,
        actualCost: 28000,
        status: AllowanceItemStatus.OVER_ALLOWANCE,
      },
      {
        id: "3",
        category: "Plumbing Fixtures",
        name: "Faucets & Sinks",
        amount: 8000,
        actualCost: null,
        status: AllowanceItemStatus.PENDING_SELECTION,
      },
    ];

    const result = calculateSoaTotals(items);

    // Total = 15,000 + 25,000 + 8,000 = 48,000
    assert.equal(result.totalAllowance, 48000);
    // Committed (SELECTED + OVER_ALLOWANCE actualCost) = 14,000 + 28,000 = 42,000
    assert.equal(result.committedAmount, 42000);
    // Remaining = 48,000 - 42,000 = 6,000
    assert.equal(result.remainingAmount, 6000);
    // Overages: Cabinetry actual 28,000 - budgeted 25,000 = 3,000
    assert.equal(result.overageAmount, 3000);
  });
});

describe("Contract Document Extractor & AI Recommendations", () => {
  it("extracts structured data from contract text", async () => {
    const sampleText = `
      PURCHASE AGREEMENT AND CONTRACT
      Contract Number: PC-2026-0042
      Buyer: Arthur Dent
      Email: arthur@galactic.co.uk
      Phone: 403-555-0199
      Municipal Address: 42 Douglas Adams Way NW, Calgary, AB
      Lot 12, Block 4, Plan 982-1234
      Base Price: $725,000.00
      Total Allowances: $65,000.00
      Purchase Price: $790,000.00
    `;

    const extracted = await extractContractData(
      "Contract_Arthur_Dent.pdf",
      Buffer.from(sampleText)
    );

    assert.equal(extracted.contractNumber, "PC-2026-0042");
    assert.equal(extracted.buyerFirstName, "Arthur");
    assert.equal(extracted.buyerLastName, "Dent");
    assert.equal(extracted.buyerEmail, "arthur@galactic.co.uk");
    assert.equal(extracted.basePrice, 725000);
    assert.equal(extracted.allowanceTotal, 65000);
    assert.equal(extracted.purchasePrice, 790000);
  });

  it("suggests allowance categories intelligently from keywords", () => {
    assert.equal(suggestAllowanceCategory("Engineered Oak Hardwood"), "Flooring");
    assert.equal(suggestAllowanceCategory("Custom Island Pantry"), "Kitchen Cabinetry");
    assert.equal(suggestAllowanceCategory("Waterfall Quartz Slab"), "Countertops");
    assert.equal(suggestAllowanceCategory("Bosch Dishwasher & Induction Cooktop"), "Appliances");
    assert.equal(suggestAllowanceCategory("Freestanding Soaker Tub"), "Plumbing Fixtures");
  });

  it("identifies $0 items, duplicate entries, and missing essential categories", () => {
    const items = [
      {
        id: "item-1",
        category: "General",
        name: "Kitchen Island Cabinets",
        amount: 0,
        selectionDueDate: null,
      },
      {
        id: "item-2",
        category: "Flooring",
        name: "Hardwood",
        amount: 12000,
        selectionDueDate: new Date("2026-06-01"),
      },
      {
        id: "item-3",
        category: "Flooring",
        name: "Hardwood",
        amount: 5000,
        selectionDueDate: new Date("2026-06-15"),
      },
    ];

    const recs = analyzeSoaItems(items);

    // Missing amount on item-1
    assert.ok(recs.some((r) => r.type === "MISSING_AMOUNT" && r.itemId === "item-1"));

    // Category suggestion for item-1 ("General" with "Kitchen Island Cabinets" -> "Kitchen Cabinetry")
    assert.ok(recs.some((r) => r.type === "CATEGORY_SUGGESTION" && r.suggestedValue === "Kitchen Cabinetry"));

    // Duplicate item between item-2 and item-3
    assert.ok(recs.some((r) => r.type === "DUPLICATE_ITEM"));

    // Missing deadline on item-1
    assert.ok(recs.some((r) => r.type === "MISSING_DEADLINE" && r.itemId === "item-1"));

    // Missing essential category (e.g. Appliances, Plumbing Fixtures)
    assert.ok(recs.some((r) => r.type === "SANITY_CHECK" && r.suggestedValue === "Appliances"));
  });
});
