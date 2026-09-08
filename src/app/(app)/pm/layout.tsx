import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function PMLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell roles={[Role.PROJECT_MANAGER, Role.OWNER, Role.CEO, Role.OPERATIONS_ADMIN]}>
      {children}
    </RoleShell>
  );
}
