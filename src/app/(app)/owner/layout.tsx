import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Ops Admin needs Manage Users; page-level requireRole still gates Owner-only surfaces.
  return (
    <RoleShell roles={[Role.OWNER, Role.OPERATIONS_ADMIN]}>
      {children}
    </RoleShell>
  );
}
