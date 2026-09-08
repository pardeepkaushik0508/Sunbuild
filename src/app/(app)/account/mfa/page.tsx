import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";
import {
  getMfaPolicy,
  getUserTwoFactorEnabled,
} from "@/lib/settings/store";
import { MfaEnrollForm } from "@/components/settings/mfa-enroll-form";
import { ROLE_HOME } from "@/lib/permissions";

export default async function AccountMfaPage() {
  const session = await requireSession();
  const policy = await getMfaPolicy(session.membership.companyId);
  const alreadyEnabled = await getUserTwoFactorEnabled(session.user.id);

  const required =
    policy.enforced &&
    policy.requiredRoles.includes(session.membership.role as Role);

  if (!required && alreadyEnabled) {
    redirect(ROLE_HOME[session.membership.role]);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#ffedd5_0%,_#f9fafb_42%,_#f9fafb_100%)] px-4 py-10">
      <MfaEnrollForm required={required} alreadyEnabled={alreadyEnabled} />
    </div>
  );
}
