import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell roles={[Role.SALES_MANAGER, Role.OWNER]}>
      {children}
    </RoleShell>
  );
}
