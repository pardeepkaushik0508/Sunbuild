import { Prisma, Role } from "@prisma/client";
import type { AppSession } from "@/lib/session";

/** Sales managers see leads they created, are assigned, or that are unassigned. */
export function salesLeadAccessWhere(
  session: AppSession
): Prisma.LeadWhereInput | undefined {
  if (session.membership.role !== Role.SALES_MANAGER) return undefined;
  return {
    OR: [
      { assigneeId: session.user.id },
      { createdById: session.user.id },
      { assigneeId: null },
    ],
  };
}
