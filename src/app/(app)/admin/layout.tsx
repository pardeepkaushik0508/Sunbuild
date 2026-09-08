import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell roles={Role.OPERATIONS_ADMIN}>{children}</RoleShell>;
}
