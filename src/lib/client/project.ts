import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  assertProjectAccess,
  getAccessibleProjectIds,
  type AppSession,
} from "@/lib/session";
import { ForbiddenError } from "@/lib/errors";

/** Resolve the client's active project (single assignment or explicit id). */
export async function resolveClientProject(
  session: AppSession,
  projectId?: string | null
) {
  if (session.membership.role !== Role.CLIENT) {
    throw new ForbiddenError();
  }

  const ids = await getAccessibleProjectIds(session);
  if (ids.length === 0) return null;

  const selected =
    projectId && ids.includes(projectId) ? projectId : ids[0];

  if (projectId && !ids.includes(projectId)) {
    throw new ForbiddenError("Forbidden: no project access");
  }

  await assertProjectAccess(session, selected);

  return prisma.project.findFirst({
    where: { id: selected, companyId: session.membership.companyId },
    include: {
      buyer: true,
      pm: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
        },
      },
    },
  });
}

export async function requireClientProjectAccess(
  session: AppSession,
  projectId: string
) {
  if (session.membership.role !== Role.CLIENT) {
    throw new ForbiddenError();
  }
  await assertProjectAccess(session, projectId);
}
