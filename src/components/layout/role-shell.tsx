import { Role } from "@prisma/client";
import { AppShell } from "@/components/layout/app-shell";
import { AuthResumeGuard } from "@/components/session/auth-resume-guard";
import { SessionTimeoutGuard } from "@/components/session/session-timeout-guard";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { sessionHasFinanceAccess } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import {
  getMfaPolicy,
  getSessionTimeoutMinutes,
  getUserTwoFactorEnabled,
} from "@/lib/settings/store";
import { redirect } from "next/navigation";

export async function RoleShell({
  roles,
  children,
  requireFinance = false,
}: {
  roles: Role | Role[];
  children: React.ReactNode;
  /** When true, also require Financial Report / finance access. */
  requireFinance?: boolean;
}) {
  const session = await requireRole(roles);
  if (requireFinance && !sessionHasFinanceAccess(session)) {
    redirect("/");
  }
  const companyId = session.membership.companyId;
  const projectIds = await getAccessibleProjectIds(session);

  const [projectCount, sessionTimeoutMinutes, mfaPolicy, mfaEnabled] =
    await Promise.all([
      projectIds.length
        ? Promise.resolve(projectIds.length)
        : prisma.project.count({
            where: { companyId },
          }),
      getSessionTimeoutMinutes(companyId),
      getMfaPolicy(companyId),
      getUserTwoFactorEnabled(session.user.id),
    ]);

  const mfaRequired =
    mfaPolicy.enforced &&
    mfaPolicy.requiredRoles.includes(session.membership.role);
  if (mfaRequired && !mfaEnabled) {
    redirect("/account/mfa");
  }

  return (
    <AppShell
      user={session.user}
      role={session.membership.role}
      companyName={session.membership.companyName}
      projectCount={projectCount}
      profiles={session.memberships}
      activeMembershipId={session.membership.id}
      whatsappContacts={[]}
      showFinanceNav={sessionHasFinanceAccess(session)}
    >
      <AuthResumeGuard />
      <SessionTimeoutGuard timeoutMinutes={sessionTimeoutMinutes} />
      {children}
    </AppShell>
  );
}
