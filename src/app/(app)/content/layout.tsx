import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell roles={[Role.OWNER, Role.CEO, Role.OPERATIONS_ADMIN]}>
      {children}
    </RoleShell>
  );
}
