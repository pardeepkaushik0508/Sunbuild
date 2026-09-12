import { Role } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  CEO: "CEO",
  OPERATIONS_ADMIN: "Operations Admin",
  SALES_MANAGER: "Sales Manager",
  PROJECT_MANAGER: "Project Manager",
  BOOKKEEPER: "Bookkeeper",
  SUBCONTRACTOR: "Subcontractor",
  CLIENT: "Client",
};

export const ROLE_HOME: Record<Role, string> = {
  OWNER: "/owner",
  CEO: "/ceo",
  OPERATIONS_ADMIN: "/admin",
  SALES_MANAGER: "/sales",
  PROJECT_MANAGER: "/pm",
  BOOKKEEPER: "/bookkeeper",
  SUBCONTRACTOR: "/sub",
  CLIENT: "/client",
};

export function hasFinanceAccess(role: Role, financeFlag?: boolean) {
  if (role === Role.CLIENT || role === Role.SUBCONTRACTOR) return false;
  if (role === Role.OWNER) return true;
  if (role === Role.BOOKKEEPER) return true;
  if (role === Role.CEO) return false;
  return Boolean(financeFlag);
}

export function canManageUsers(role: Role) {
  return role === Role.OWNER || role === Role.OPERATIONS_ADMIN;
}

export function canEditSettings(role: Role, flag?: boolean) {
  if (role === Role.OWNER) return true;
  if (role === Role.OPERATIONS_ADMIN) return true;
  return Boolean(flag);
}

export function isInternalStaff(role: Role) {
  return role !== Role.CLIENT && role !== Role.SUBCONTRACTOR;
}

export function canAccessProject(
  role: Role,
  opts: { isAssigned: boolean; isPm?: boolean; isBuyer?: boolean }
) {
  if (role === Role.OWNER || role === Role.CEO || role === Role.OPERATIONS_ADMIN) {
    return true;
  }
  if (role === Role.BOOKKEEPER) return true;
  if (role === Role.SALES_MANAGER) return opts.isAssigned;
  if (role === Role.PROJECT_MANAGER) return opts.isAssigned || opts.isPm;
  if (role === Role.SUBCONTRACTOR) return opts.isAssigned;
  if (role === Role.CLIENT) return opts.isAssigned || opts.isBuyer;
  return false;
}

export type NavItem = {
  label: string;
  href: string;
  roles: Role[];
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/owner", roles: [Role.OWNER] },
  { label: "Overview", href: "/ceo", roles: [Role.CEO] },
  { label: "Overview", href: "/admin", roles: [Role.OPERATIONS_ADMIN] },
  { label: "Jobs", href: "/owner/jobs", roles: [Role.OWNER] },
  { label: "Jobs", href: "/pm/projects", roles: [Role.CEO, Role.OPERATIONS_ADMIN] },
  { label: "Users", href: "/owner/users", roles: [Role.OWNER, Role.OPERATIONS_ADMIN] },
  { label: "Permissions", href: "/owner/permissions", roles: [Role.OWNER] },
  { label: "Settings", href: "/owner/settings", roles: [Role.OWNER] },
  {
    label: "Settings",
    href: "/settings",
    roles: [
      Role.PROJECT_MANAGER,
      Role.SALES_MANAGER,
      Role.CEO,
      Role.OPERATIONS_ADMIN,
      Role.BOOKKEEPER,
    ],
  },
  { label: "Alerts", href: "/owner/alerts", roles: [Role.OWNER] },
  { label: "Approvals", href: "/ceo/approvals", roles: [Role.CEO] },
  { label: "Leads", href: "/sales/leads", roles: [Role.SALES_MANAGER, Role.OWNER] },
  { label: "Dashboard", href: "/pm", roles: [Role.PROJECT_MANAGER] },
  { label: "Projects", href: "/pm/projects", roles: [Role.PROJECT_MANAGER, Role.OWNER, Role.CEO] },
  { label: "Tasks", href: "/pm/tasks", roles: [Role.PROJECT_MANAGER] },
  { label: "Schedule", href: "/pm/schedule", roles: [Role.PROJECT_MANAGER] },
  { label: "RFIs", href: "/pm/rfis", roles: [Role.PROJECT_MANAGER] },
  { label: "Daily Logs", href: "/pm/daily-logs", roles: [Role.PROJECT_MANAGER] },
  { label: "Selections", href: "/pm/selections", roles: [Role.PROJECT_MANAGER] },
  { label: "Change Orders", href: "/pm/change-orders", roles: [Role.PROJECT_MANAGER] },
  { label: "Documents", href: "/pm/documents", roles: [Role.PROJECT_MANAGER] },
  { label: "Photos", href: "/pm/photos", roles: [Role.PROJECT_MANAGER] },
  { label: "Contracts", href: "/pm/contracts", roles: [Role.PROJECT_MANAGER, Role.OWNER] },
  { label: "Warranty", href: "/pm/warranty", roles: [Role.PROJECT_MANAGER] },
  { label: "Invoices", href: "/bookkeeper/invoices", roles: [Role.BOOKKEEPER, Role.OWNER] },
  { label: "Jobs", href: "/sub", roles: [Role.SUBCONTRACTOR] },
  { label: "My Home", href: "/client", roles: [Role.CLIENT] },
  { label: "Selections", href: "/client/selections", roles: [Role.CLIENT] },
  { label: "Change Orders", href: "/client/change-orders", roles: [Role.CLIENT] },
  { label: "Invoices", href: "/client/invoices", roles: [Role.CLIENT] },
  { label: "Documents", href: "/client/documents", roles: [Role.CLIENT] },
  { label: "Photos", href: "/client/photos", roles: [Role.CLIENT] },
  { label: "Schedule", href: "/client/schedule", roles: [Role.CLIENT] },
  { label: "Warranty", href: "/client/warranty", roles: [Role.CLIENT] },
];
