import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

const ALL_ROLES: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
  Role.SUBCONTRACTOR,
  Role.CLIENT,
];

export default async function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell roles={ALL_ROLES}>{children}</RoleShell>;
}
