"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { ROLE_HOME } from "@/lib/permissions";
import { setActiveMembershipCookie } from "@/lib/membership-cookie";
import { ForbiddenError } from "@/lib/errors";
import { isCompanyVisibleInMvp } from "@/lib/companies/mvp-visibility";

/**
 * Switch active profile (membership/role) without re-login.
 * Validates the membership belongs to the signed-in user, then redirects
 * to that role's home dashboard.
 */
export async function switchActiveMembership(membershipId: string) {
  const session = await requireSession();
  const id = membershipId?.trim();
  if (!id) throw new ForbiddenError("Invalid profile");

  const membership = await prisma.membership.findFirst({
    where: {
      id,
      userId: session.user.id,
      isActive: true,
      company: { isActive: true },
    },
    select: { id: true, role: true, company: { select: { slug: true } } },
  });

  if (!membership || !isCompanyVisibleInMvp(membership.company.slug)) {
    throw new ForbiddenError("Profile not available");
  }

  await setActiveMembershipCookie(membership.id);
  revalidatePath("/", "layout");
  redirect(ROLE_HOME[membership.role]);
}
