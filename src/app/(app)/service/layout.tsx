import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function ServiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell
      roles={[
        Role.SERVICE_COORDINATOR,
        Role.OWNER,
        Role.OPERATIONS_ADMIN,
      ]}
    >
      {children}
    </RoleShell>
  );
}
