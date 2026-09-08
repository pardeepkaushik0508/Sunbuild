import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function SubLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell roles={Role.SUBCONTRACTOR}>{children}</RoleShell>;
}
