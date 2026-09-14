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
    Role.SALES_MANAGER,
  ] as Role[],
  manageSoa: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
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
    Role.CEO,
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
  createDailyLog: [
    Role.SUBCONTRACTOR,
  ] as Role[],
  uploadDocuments: [
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
    Role.SALES_MANAGER,
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
  manageSiteContent: [
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
  ] as Role[],
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

  const baseAllowed = (CAPABILITIES[capability] as Role[]).includes(role);
  const moduleKey = matrix ? moduleForCapability(capability) : null;

  // Permissions Matrix is authoritative for mapped modules: Owner can grant
  // OR revoke module access for any matrix role (not just restrict).
  if (moduleKey && matrix && isMatrixRole(role)) {
    return Boolean(matrix[moduleKey][role]);
  }

  return baseAllowed;
}

/** True when the session may use the Manage Users module (matrix or base role). */
export function sessionHasUserManagement(session: AppSession): boolean {
  return roleHasCapability(
    session.membership.role,
    "manageUsers",
    session.membership.permissionMatrix
  );
}

/** Client Communication module — WhatsApp / client messaging surfaces. */
export function sessionHasClientCommunication(session: AppSession): boolean {
  const role = session.membership.role;
  if (role === Role.OWNER) return true;
  const matrix = session.membership.permissionMatrix;
  if (matrix && isMatrixRole(role)) {
    return Boolean(matrix.clientCommunication[role]);
  }
  return role !== Role.SUBCONTRACTOR;
}

export function requireCapability(session: AppSession, capability: Capability) {
  if (
    !roleHasCapability(
      session.membership.role,
      capability,
      session.membership.permissionMatrix
    )
  ) {
    throw new ForbiddenError(
      "You do not have permission to perform this action. Ask the Owner to update Permissions."
    );
  }
}

export function requireRoles(session: AppSession, roles: Role | Role[]) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(session.membership.role)) {
    throw new ForbiddenError();
  }
}

export function requireFinanceAccess(session: AppSession) {
  if (!sessionHasFinanceAccess(session)) {
    throw new ForbiddenError();
  }
}

/** Finance UI / invoice access — membership flag OR Permissions Matrix grant. */
export function sessionHasFinanceAccess(session: AppSession): boolean {
  const role = session.membership.role;
  const matrix = session.membership.permissionMatrix;
  const matrixOn =
    matrix && isMatrixRole(role) ? Boolean(matrix.financialReport[role]) : null;

  return financeFlag(role, session.membership.financeAccess, matrixOn);
}

/** Roles that may set document/photo visibility to CLIENT_VISIBLE. */
export function canSetClientVisibility(role: Role) {
  return (
    role === Role.OWNER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER
  );
}

/**
 * Roles allowed to invite others. Owner may invite anyone.
 * Other staff with manageUsers (enforced separately) may invite except Owner/CEO.
 */
export function canInviteRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === Role.OWNER) return true;
  if (actorRole === Role.CLIENT || actorRole === Role.SUBCONTRACTOR) {
    return false;
  }
  return (
    targetRole !== Role.OWNER &&
    targetRole !== Role.CEO &&
    (Object.values(Role) as string[]).includes(targetRole)
  );
}

export function isValidRole(value: string): value is Role {
  return (Object.values(Role) as string[]).includes(value);
}
