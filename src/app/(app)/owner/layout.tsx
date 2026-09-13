import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";
import { MATRIX_ROLES } from "@/lib/permission-matrix";

export default async function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Owner routes include Manage Users, which any matrix role may receive via
  // Permissions. Page-level requireRole / capability checks still gate surfaces.
  return (
    <RoleShell roles={[Role.OWNER, ...MATRIX_ROLES]}>{children}</RoleShell>
  );
}
