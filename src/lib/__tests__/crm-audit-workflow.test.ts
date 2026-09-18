import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { InvoiceStatus, Role, WarrantyStatus } from "@prisma/client";
import { depositDisplayLabel, CLIENT_DEPOSIT_LABEL } from "../labels";
import {
  canBookkeeperVerifyPayment,
  canClientReportPayment,
  financeRolesCanSeeAllSubPayments,
} from "../payments/invoice-flow";
import { salesLeadAccessWhere } from "../leads/visibility";

describe("client deposit label", () => {
  it("replaces incorrect Sales Deposit wording", () => {
    assert.equal(depositDisplayLabel(null), CLIENT_DEPOSIT_LABEL);
    assert.equal(depositDisplayLabel("Sales Deposit"), CLIENT_DEPOSIT_LABEL);
    assert.equal(depositDisplayLabel("Further deposit, by date"), CLIENT_DEPOSIT_LABEL);
  });
});

describe("external payment workflow", () => {
  it("client can report sent/viewed/overdue but not paid", () => {
    assert.equal(canClientReportPayment(InvoiceStatus.SENT), true);
    assert.equal(canClientReportPayment(InvoiceStatus.PAID), false);
    assert.equal(canClientReportPayment(InvoiceStatus.PAYMENT_REPORTED), false);
  });

  it("only reported payments are in the verification queue", () => {
    assert.equal(canBookkeeperVerifyPayment(InvoiceStatus.PAYMENT_REPORTED), true);
    assert.equal(canBookkeeperVerifyPayment(InvoiceStatus.SENT), false);
  });
});

describe("subcontractor payment privacy", () => {
  it("staff finance roles see all project sub totals; subs do not", () => {
    assert.equal(financeRolesCanSeeAllSubPayments(Role.OWNER), true);
    assert.equal(financeRolesCanSeeAllSubPayments(Role.BOOKKEEPER), true);
    assert.equal(financeRolesCanSeeAllSubPayments(Role.PROJECT_MANAGER), true);
    assert.equal(financeRolesCanSeeAllSubPayments(Role.SUBCONTRACTOR), false);
    assert.equal(financeRolesCanSeeAllSubPayments(Role.CLIENT), false);
    assert.equal(financeRolesCanSeeAllSubPayments(Role.SERVICE_COORDINATOR), false);
  });
});

describe("sales lead visibility", () => {
  it("includes created-by leads for sales managers", () => {
    const where = salesLeadAccessWhere({
      user: { id: "u1" },
      membership: { role: Role.SALES_MANAGER },
    } as never);
    assert.ok(where);
    const ors = (where as { OR: Array<Record<string, unknown>> }).OR;
    assert.ok(ors.some((c) => c.createdById === "u1"));
  });
});

describe("warranty resolved vs closed", () => {
  it("keeps resolved distinct from closed", () => {
    assert.notEqual(WarrantyStatus.RESOLVED, WarrantyStatus.CLOSED);
  });
});
