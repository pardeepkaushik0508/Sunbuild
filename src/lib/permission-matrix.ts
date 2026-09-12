import { Role } from "@prisma/client";

/** Roles shown as columns in the Figma Permissions Matrix (Owner configures; excluded from columns). */
export const MATRIX_ROLES = [
  Role.OPERATIONS_ADMIN,
  Role.PROJECT_MANAGER,
  Role.SALES_MANAGER,
  Role.BOOKKEEPER,
  Role.SUBCONTRACTOR,
  Role.CLIENT,
  Role.CEO,
] as const;

export type MatrixRole = (typeof MATRIX_ROLES)[number];

export const MATRIX_ROLE_LABELS: Record<MatrixRole, string> = {
  OPERATIONS_ADMIN: "Admin",
  PROJECT_MANAGER: "Project manager",
  SALES_MANAGER: "Sales Manager",
  BOOKKEEPER: "Bookkeeper",
  SUBCONTRACTOR: "Subcontractor",
  CLIENT: "Client",
  CEO: "CEO",
};

export type PermissionModuleKey =
  | "userManagement"
  | "financialReport"
  | "projectCreation"
  | "scheduleManagement"
  | "clientCommunication";

export const PERMISSION_MODULES: Array<{
  key: PermissionModuleKey;
  label: string;
}> = [
  { key: "userManagement", label: "User Management" },
  { key: "financialReport", label: "Financial Report" },
  { key: "projectCreation", label: "Project Creation" },
  { key: "scheduleManagement", label: "Schedule Management" },
  { key: "clientCommunication", label: "Client Communication" },
];

export type PermissionMatrixState = Record<
  PermissionModuleKey,
  Record<MatrixRole, boolean>
>;

/**
 * Defaults aligned with docs/ROLE_PERMISSIONS.md.
 * Matrix toggles may further restrict base CAPABILITIES — they must not
 * escalate privileges beyond the hard-coded capability table.
 */
export const DEFAULT_PERMISSION_MATRIX: PermissionMatrixState = {
  userManagement: {
    OPERATIONS_ADMIN: true,
    PROJECT_MANAGER: false,
    SALES_MANAGER: false,
    BOOKKEEPER: false,
    SUBCONTRACTOR: false,
    CLIENT: false,
    CEO: false,
  },
  financialReport: {
    OPERATIONS_ADMIN: false,
    PROJECT_MANAGER: false,
    SALES_MANAGER: false,
    BOOKKEEPER: true,
    SUBCONTRACTOR: false,
    CLIENT: false,
    CEO: false,
  },
  projectCreation: {
    OPERATIONS_ADMIN: true,
    PROJECT_MANAGER: false,
    SALES_MANAGER: true,
    BOOKKEEPER: false,
    SUBCONTRACTOR: false,
    CLIENT: false,
    CEO: true,
  },
  scheduleManagement: {
    OPERATIONS_ADMIN: true,
    PROJECT_MANAGER: true,
    SALES_MANAGER: false,
    BOOKKEEPER: false,
    SUBCONTRACTOR: false,
    CLIENT: true,
    CEO: true,
  },
  clientCommunication: {
    OPERATIONS_ADMIN: true,
    PROJECT_MANAGER: true,
    SALES_MANAGER: true,
    BOOKKEEPER: false,
    SUBCONTRACTOR: false,
    CLIENT: true,
    CEO: true,
  },
};

export function parsePermissionMatrix(raw: unknown): PermissionMatrixState {
  const base: PermissionMatrixState = structuredClone(DEFAULT_PERMISSION_MATRIX);
  if (!raw || typeof raw !== "object") return base;

  for (const mod of PERMISSION_MODULES) {
    const row = (raw as Record<string, unknown>)[mod.key];
    if (!row || typeof row !== "object") continue;
    for (const role of MATRIX_ROLES) {
      const val = (row as Record<string, unknown>)[role];
      if (typeof val === "boolean") {
        base[mod.key][role] = val;
      }
    }
  }
  return base;
}

/**
 * Map matrix modules → authorization capability keys (enforced as restrictions).
 * Finance is enforced via requireFinanceAccess (not companyWideProjects).
 */
export const MODULE_TO_CAPABILITIES: Record<
  PermissionModuleKey,
  Array<"manageUsers" | "manageContracts" | "manageSchedule">
> = {
  userManagement: ["manageUsers"],
  financialReport: [],
  projectCreation: ["manageContracts"],
  scheduleManagement: ["manageSchedule"],
  // View/comms oriented — stored for UX; staff write caps stay role-based.
  clientCommunication: [],
};
