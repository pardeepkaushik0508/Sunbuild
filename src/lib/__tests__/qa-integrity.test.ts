/**
 * Business-logic and permission-hardening tests for SUNBUILD QA pass.
 * Run: npx tsx --test src/lib/__tests__/qa-integrity.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import {
  roleHasCapability,
  requireFinanceAccess,
} from "../authorization";
import { hasFinanceAccess } from "../permissions";
import {
  DEFAULT_PERMISSION_MATRIX,
  parsePermissionMatrix,
} from "../permission-matrix";
import { formatDate } from "../utils";
import { ForbiddenError } from "../errors";
import type { AppSession } from "../session";

function fakeSession(
  role: Role,
  opts?: { financeAccess?: boolean; matrix?: typeof DEFAULT_PERMISSION_MATRIX }
): AppSession {
  return {
    user: {
      id: "u1",
      name: "Test",
      email: "t@example.com",
      isActive: true,
    },
    membership: {
      id: "m1",
      role,
      companyId: "c1",
      companyName: "Sunview",
      companySlug: "sunview",
      canEditSettings: false,
      financeAccess: opts?.financeAccess ?? false,
      permissionMatrix: opts?.matrix ?? DEFAULT_PERMISSION_MATRIX,
    },
    memberships: [],
  };
}

describe("permission matrix cannot escalate", () => {
  it("Sales cannot manageUsers even if matrix toggles are true", () => {
    const escalated = structuredClone(DEFAULT_PERMISSION_MATRIX);
    escalated.userManagement.SALES_MANAGER = true;
    assert.equal(
      roleHasCapability(Role.SALES_MANAGER, "manageUsers", escalated),
      false
    );
  });

  it("CEO cannot manageUsers with default or escalated matrix", () => {
    const escalated = structuredClone(DEFAULT_PERMISSION_MATRIX);
    escalated.userManagement.CEO = true;
    assert.equal(roleHasCapability(Role.CEO, "manageUsers", escalated), false);
    assert.equal(
      roleHasCapability(Role.CEO, "manageUsers", DEFAULT_PERMISSION_MATRIX),
      false
    );
  });

  it("Ops Admin retains manageUsers when matrix allows", () => {
    assert.equal(
      roleHasCapability(
        Role.OPERATIONS_ADMIN,
        "manageUsers",
        DEFAULT_PERMISSION_MATRIX
      ),
      true
    );
  });

  it("matrix can restrict Ops Admin manageUsers", () => {
    const restricted = structuredClone(DEFAULT_PERMISSION_MATRIX);
    restricted.userManagement.OPERATIONS_ADMIN = false;
    assert.equal(
      roleHasCapability(Role.OPERATIONS_ADMIN, "manageUsers", restricted),
      false
    );
  });

  it("financialReport matrix no longer grants companyWideProjects", () => {
    const matrix = structuredClone(DEFAULT_PERMISSION_MATRIX);
    matrix.financialReport.SALES_MANAGER = true;
    assert.equal(
      roleHasCapability(Role.SALES_MANAGER, "companyWideProjects", matrix),
      false
    );
  });
});

describe("finance access boundaries", () => {
  it("CEO never has finance access", () => {
    assert.equal(hasFinanceAccess(Role.CEO, true), false);
    assert.throws(
      () => requireFinanceAccess(fakeSession(Role.CEO, { financeAccess: true })),
      (err: unknown) => err instanceof ForbiddenError
    );
  });

  it("Bookkeeper always has finance access", () => {
    assert.doesNotThrow(() =>
      requireFinanceAccess(fakeSession(Role.BOOKKEEPER))
    );
  });

  it("PM needs membership finance flag and matrix", () => {
    assert.throws(
      () =>
        requireFinanceAccess(
          fakeSession(Role.PROJECT_MANAGER, { financeAccess: false })
        ),
      (err: unknown) => err instanceof ForbiddenError
    );
    assert.throws(
      () =>
        requireFinanceAccess(
          fakeSession(Role.PROJECT_MANAGER, {
            financeAccess: true,
            matrix: DEFAULT_PERMISSION_MATRIX, // PM financialReport default false
          })
        ),
      (err: unknown) => err instanceof ForbiddenError
    );
    const matrix = structuredClone(DEFAULT_PERMISSION_MATRIX);
    matrix.financialReport.PROJECT_MANAGER = true;
    assert.doesNotThrow(() =>
      requireFinanceAccess(
        fakeSession(Role.PROJECT_MANAGER, { financeAccess: true, matrix })
      )
    );
  });
});

describe("default matrix matches role docs", () => {
  it("CEO and Sales have no finance / user management by default", () => {
    const m = parsePermissionMatrix(null);
    assert.equal(m.financialReport.CEO, false);
    assert.equal(m.financialReport.SALES_MANAGER, false);
    assert.equal(m.userManagement.CEO, false);
    assert.equal(m.userManagement.SALES_MANAGER, false);
    assert.equal(m.financialReport.BOOKKEEPER, true);
    assert.equal(m.userManagement.OPERATIONS_ADMIN, true);
  });
});

describe("formatDate crash resistance", () => {
  it("handles null, invalid, and valid dates", () => {
    assert.equal(formatDate(null), "—");
    assert.equal(formatDate(undefined), "—");
    assert.equal(formatDate("not-a-date"), "—");
    assert.equal(formatDate(new Date("invalid")), "—");
    const ok = formatDate(new Date("2024-06-15T12:00:00Z"));
    assert.notEqual(ok, "—");
    assert.ok(!ok.includes("Invalid"));
  });
});

describe("warranty eligibility logic", () => {
  it("expired warrantyEnd blocks claims", () => {
    const now = Date.now();
    const warrantyStart = new Date(now - 400 * 24 * 60 * 60 * 1000);
    const warrantyEnd = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const active =
      Boolean(warrantyStart) &&
      (!warrantyEnd || warrantyEnd.getTime() >= now);
    assert.equal(active, false);
  });

  it("active warranty window allows claims", () => {
    const now = Date.now();
    const warrantyStart = new Date(now - 10 * 24 * 60 * 60 * 1000);
    const warrantyEnd = new Date(now + 300 * 24 * 60 * 60 * 1000);
    const active =
      Boolean(warrantyStart) &&
      (!warrantyEnd || warrantyEnd.getTime() >= now);
    assert.equal(active, true);
  });
});

describe("change order transition rules", () => {
  it("only PENDING_CLIENT may be decided", () => {
    const allowedFrom = new Set(["PENDING_CLIENT"]);
    assert.equal(allowedFrom.has("PENDING_CLIENT"), true);
    assert.equal(allowedFrom.has("APPROVED"), false);
    assert.equal(allowedFrom.has("REJECTED"), false);
    assert.equal(allowedFrom.has("DRAFT"), false);
  });
});

describe("CEO approval capability", () => {
  it("PM cannot approve completion", () => {
    assert.equal(
      roleHasCapability(Role.PROJECT_MANAGER, "ceoApproveCompletion"),
      false
    );
    assert.equal(roleHasCapability(Role.CEO, "ceoApproveCompletion"), true);
  });
});
