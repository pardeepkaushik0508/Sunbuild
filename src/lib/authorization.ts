import { Role } from "@prisma/client";
import type { AppSession } from "@/lib/session";
import { ForbiddenError } from "@/lib/errors";
import { hasFinanceAccess as financeFlag } from "@/lib/permissions";
import {
  MODULE_TO_CAPABILITIES,
  PERMISSION_MODULES,
  type MatrixRole,
  type PermissionMatrixState,
  type PermissionModuleKey,
  MATRIX_ROLES,
} from "@/lib/permission-matrix";

/** Capability matrix — roles that may perform each action (defaults). */
export const CAPABILITIES = {
  manageLeads: [Role.OWNER, Role.SALES_MANAGER] as Role[],
  manageContracts: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
    Role.SALES_MANAGER,
  ] as Role[],
  manageTasks: [
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  updateOwnOrAssignedTasks: [
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
    Role.SUBCONTRACTOR,
  ] as Role[],
  assignSubcontractors: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  manageSchedule: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  manageRfis: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
    Role.SUBCONTRACTOR,
  ] as Role[],
  manageDailyLogs: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
    Role.SUBCONTRACTOR,
  ] as Role[],
  uploadDocuments: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  uploadPhotos: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
    Role.SUBCONTRACTOR,
  ] as Role[],
  publishPhotos: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  manageSelectionsStaff: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  clientSelections: [Role.CLIENT] as Role[],
  manageChangeOrdersStaff: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  clientChangeOrders: [Role.CLIENT] as Role[],
  uploadCompletion: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  ceoApproveCompletion: [Role.CEO, Role.OWNER] as Role[],
  createWarranty: [Role.CLIENT] as Role[],
  manageWarranty: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.PROJECT_MANAGER,
  ] as Role[],
  manageUsers: [Role.OWNER, Role.OPERATIONS_ADMIN] as Role[],
  companyWideProjects: [
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
    Role.BOOKKEEPER,
  ] as Role[],
} as const;

export type Capability = keyof typeof CAPABILITIES;

function isMatrixRole(role: Role): role is MatrixRole {
  return (MATRIX_ROLES as readonly Role[]).includes(role);
}

function moduleForCapability(capability: Capability): PermissionModuleKey | null {
  for (const mod of PERMISSION_MODULES) {
    const caps = MODULE_TO_CAPABILITIES[mod.key];
    if ((caps as string[]).includes(capability)) return mod.key;
  }
  return null;
}

export function roleHasCapability(
  role: Role,
  capability: Capability,
  matrix?: PermissionMatrixState | null
): boolean {
  if (role === Role.OWNER) return true;

  // Base capability table is the privilege ceiling — the company matrix may
  // only further restrict (never escalate beyond CAPABILITIES).
  const baseAllowed = (CAPABILITIES[capability] as Role[]).includes(role);
  if (!baseAllowed) return false;

  const moduleKey = matrix ? moduleForCapability(capability) : null;
  if (moduleKey && matrix && isMatrixRole(role)) {
    return Boolean(matrix[moduleKey][role]);
  }

  return true;
}

export function requireCapability(session: AppSession, capability: Capability) {
  if (
    !roleHasCapability(
      session.membership.role,
      capability,
      session.membership.permissionMatrix
    )
  ) {
    throw new ForbiddenError();
  }
}

export function requireRoles(session: AppSession, roles: Role | Role[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(session.membership.role)) {
    throw new ForbiddenError();
  }
}

export function requireFinanceAccess(session: AppSession) {
  const role = session.membership.role;
  if (role === Role.OWNER) return;
  // Role + membership finance flag is the privilege ceiling (CEO never).
  if (!financeFlag(role, session.membership.financeAccess)) {
    throw new ForbiddenError();
  }
  // Company matrix may further restrict roles that otherwise qualify.
  if (session.membership.permissionMatrix && isMatrixRole(role)) {
    if (!session.membership.permissionMatrix.financialReport[role]) {
      throw new ForbiddenError();
    }
  }
}

/** Roles that may set document/photo visibility to CLIENT_VISIBLE. */
export function canSetClientVisibility(role: Role) {
  return (
    role === Role.OWNER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER
  );
}

/** Roles allowed to be invited by Operations/Owner (no self-elevation to OWNER by Ops). */
export function canInviteRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.OWNER) return true;
  if (actorRole === Role.OPERATIONS_ADMIN) {
    return (
      targetRole !== Role.OWNER &&
      targetRole !== Role.CEO &&
      Object.values(Role).includes(targetRole)
    );
  }
  return false;
}

export function isValidRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}
