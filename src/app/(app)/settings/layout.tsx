import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

const STAFF_SETTINGS_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell roles={STAFF_SETTINGS_ROLES}>{children}</RoleShell>;
}
