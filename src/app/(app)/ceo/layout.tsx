import { Role } from "@prisma/client";
import { RoleShell } from "@/components/layout/role-shell";

export default async function CeoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <RoleShell roles={[Role.CEO, Role.OWNER]}>{children}</RoleShell>;
}
