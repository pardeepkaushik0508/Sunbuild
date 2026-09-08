import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell roles={Role.CLIENT}>{children}</RoleShell>;
}
