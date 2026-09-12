import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

/** Invoices / bookkeeper area — Owner + Bookkeeper, or any staff granted Financial Report. */
export default async function BookkeeperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell
      roles={[
        Role.BOOKKEEPER,
        Role.OWNER,
        Role.PROJECT_MANAGER,
        Role.OPERATIONS_ADMIN,
        Role.SALES_MANAGER,
      ]}
      requireFinance
    >
      {children}
    </RoleShell>
  );
}
