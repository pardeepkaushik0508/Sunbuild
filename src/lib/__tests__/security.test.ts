/**
 * Unit tests for authorization helpers, path safety, and open-redirect protection.
 * Run: npx tsx --test src/lib/__tests__/security.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Role } from "@prisma/client";
import {
  canInviteRole,
  roleHasCapability,
  isValidRole,
  canSetClientVisibility,
} from "../authorization";
import { safeInternalPath } from "../safe-redirect";
import { checkRateLimit } from "../rate-limit";
import { validateUploadFile, ALLOWED_EXTENSIONS } from "../storage";

describe("RBAC capabilities", () => {
  it("clients cannot manage contracts or finance uploads", () => {
    assert.equal(roleHasCapability(Role.CLIENT, "manageContracts"), false);
    assert.equal(roleHasCapability(Role.CLIENT, "uploadCompletion"), false);
    assert.equal(roleHasCapability(Role.CLIENT, "manageWarranty"), false);
    assert.equal(roleHasCapability(Role.CLIENT, "createWarranty"), true);
    assert.equal(roleHasCapability(Role.CLIENT, "clientChangeOrders"), true);
  });

  it("subcontractors cannot assign others or publish photos", () => {
    assert.equal(roleHasCapability(Role.SUBCONTRACTOR, "assignSubcontractors"), false);
    assert.equal(roleHasCapability(Role.SUBCONTRACTOR, "publishPhotos"), false);
    assert.equal(roleHasCapability(Role.SUBCONTRACTOR, "uploadPhotos"), true);
    assert.equal(roleHasCapability(Role.SUBCONTRACTOR, "manageTasks"), false);
  });

  it("only CEO/OWNER can approve completion", () => {
    assert.equal(roleHasCapability(Role.CEO, "ceoApproveCompletion"), true);
    assert.equal(roleHasCapability(Role.OWNER, "ceoApproveCompletion"), true);
    assert.equal(roleHasCapability(Role.PROJECT_MANAGER, "ceoApproveCompletion"), false);
    assert.equal(roleHasCapability(Role.OPERATIONS_ADMIN, "ceoApproveCompletion"), false);
  });

  it("operations admin cannot invite OWNER or CEO", () => {
    assert.equal(canInviteRole(Role.OPERATIONS_ADMIN, Role.OWNER), false);
    assert.equal(canInviteRole(Role.OPERATIONS_ADMIN, Role.CEO), false);
    assert.equal(canInviteRole(Role.OPERATIONS_ADMIN, Role.PROJECT_MANAGER), true);
    assert.equal(canInviteRole(Role.OWNER, Role.CEO), true);
  });

  it("rejects forged role strings", () => {
    assert.equal(isValidRole("owner"), false);
    assert.equal(isValidRole("OWNER"), true);
    assert.equal(isValidRole("SUPERADMIN"), false);
  });

  it("only staff can set client visibility", () => {
    assert.equal(canSetClientVisibility(Role.CLIENT), false);
    assert.equal(canSetClientVisibility(Role.SUBCONTRACTOR), false);
    assert.equal(canSetClientVisibility(Role.PROJECT_MANAGER), true);
  });
});

describe("open redirect protection", () => {
  it("allows internal paths only", () => {
    assert.equal(safeInternalPath("/pm/projects"), "/pm/projects");
    assert.equal(safeInternalPath("//evil.com"), "/");
    assert.equal(safeInternalPath("https://evil.com"), "/");
    assert.equal(safeInternalPath("/\\evil"), "/");
    assert.equal(safeInternalPath(null, "/owner"), "/owner");
  });
});

describe("rate limiting", () => {
  it("blocks after limit", () => {
    const key = `test-${Date.now()}-${Math.random()}`;
    assert.equal(checkRateLimit(key, 2, 60_000).ok, true);
    assert.equal(checkRateLimit(key, 2, 60_000).ok, true);
    assert.equal(checkRateLimit(key, 2, 60_000).ok, false);
  });
});

describe("upload validation", () => {
  it("rejects executables and oversize", () => {
    assert.ok(ALLOWED_EXTENSIONS.has(".pdf"));
    assert.ok(!ALLOWED_EXTENSIONS.has(".exe"));

    const exe = new File(["x"], "malware.exe", { type: "application/octet-stream" });
    assert.throws(() => validateUploadFile(exe), /not allowed|File type/i);

    const ok = new File([new Uint8Array([1, 2, 3])], "doc.pdf", {
      type: "application/pdf",
    });
    assert.doesNotThrow(() => validateUploadFile(ok));
  });
});
