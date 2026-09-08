import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function BookkeeperLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleShell roles={[Role.BOOKKEEPER, Role.OWNER]}>
      {children}
    </RoleShell>
  );
}
