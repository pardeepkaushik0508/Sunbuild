import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ROLE_HOME } from "@/lib/permissions";
import { ForbiddenError, UnauthorizedError } from "@/lib/errors";
import { type PermissionMatrixState } from "@/lib/permission-matrix";
import { getCompanyPermissionMatrix } from "@/lib/permission-matrix-store";
import { getActiveMembershipCookie } from "@/lib/membership-cookie";
import { isCompanyVisibleInMvp } from "@/lib/companies/mvp-visibility";

export type AppSession = {
  user: {
    id: string;
    name: string;
    email: string;
    image?: string | null;
    phone?: string | null;
    isActive: boolean;
  };
  membership: {
    id: string;
    role: Role;
    companyId: string;
    companyName: string;
    companySlug: string;
    canEditSettings: boolean;
    financeAccess: boolean;
    permissionMatrix: PermissionMatrixState;
  };
  memberships: Array<{
    id: string;
    role: Role;
    companyId: string;
    companyName: string;
    companySlug: string;
  }>;
};

/**
 * Request-scoped session load (deduped via React.cache).
 * Prevents RoleShell + page + loaders from re-querying auth/membership.
 */
const loadAppSession = cache(async (): Promise<AppSession | null> => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session?.user) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      isActive: true,
      memberships: {
        where: { isActive: true },
        select: {
          id: true,
          role: true,
          canEditSettings: true,
          financeAccess: true,
          company: {
            select: {
              id: true,
              name: true,
              slug: true,
              isActive: true,
            },
          },
        },
        orderBy: [{ createdAt: "asc" }, { role: "asc" }],
      },
    },
  });

  if (!user || !user.isActive) return null;

  const activeMemberships = user.memberships.filter(
    (m) => m.company.isActive && isCompanyVisibleInMvp(m.company.slug)
  );
  if (activeMemberships.length === 0) return null;

  const preferredId = await getActiveMembershipCookie();
  const membership =
    activeMemberships.find((m) => m.id === preferredId) ??
    activeMemberships[0];

  const permissionMatrix = await getCompanyPermissionMatrix(
    membership.company.id
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      phone: user.phone,
      isActive: user.isActive,
    },
    membership: {
      id: membership.id,
      role: membership.role,
      companyId: membership.company.id,
      companyName: membership.company.name,
      companySlug: membership.company.slug,
      canEditSettings: membership.canEditSettings,
      financeAccess: membership.financeAccess,
      permissionMatrix,
    },
    memberships: activeMemberships.map((m) => ({
      id: m.id,
      role: m.role,
      companyId: m.company.id,
      companyName: m.company.name,
      companySlug: m.company.slug,
    })),
  };
});

export async function getSession() {
  return auth.api.getSession({
    headers: await headers(),
  });
}

export async function requireSession(): Promise<AppSession> {
  const app = await loadAppSession();
  if (!app) {
    redirect("/login");
  }
  return app;
}

/** For API routes / programmatic callers — throws instead of redirect. */
export async function requireApiSession(): Promise<AppSession> {
  const app = await loadAppSession();
  if (!app) {
    throw new UnauthorizedError();
  }
  return app;
}

export async function requireRole(roles: Role | Role[]) {
  const session = await requireSession();
  const allowed = Array.isArray(roles) ? roles : [roles];
  if (!allowed.includes(session.membership.role)) {
    redirect(ROLE_HOME[session.membership.role]);
  }
  return session;
}

/**
 * Project IDs the user may access within their active company membership.
 * Deduped per request via React.cache.
 */
export const getAccessibleProjectIds = cache(async (session: AppSession) => {
  const { role, companyId } = session.membership;
  const userId = session.user.id;

  if (
    role === Role.OWNER ||
    role === Role.CEO ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.BOOKKEEPER
  ) {
    const projects = await prisma.project.findMany({
      where: { companyId },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  if (role === Role.PROJECT_MANAGER) {
    const projects = await prisma.project.findMany({
      where: {
        companyId,
        OR: [{ pmId: userId }, { access: { some: { userId } } }],
      },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  if (role === Role.SALES_MANAGER) {
    const projects = await prisma.project.findMany({
      where: {
        companyId,
        access: { some: { userId } },
      },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  const access = await prisma.projectAccess.findMany({
    where: {
      userId,
      project: { companyId },
    },
    select: { projectId: true },
  });
  return access.map((a) => a.projectId);
});

export async function assertProjectAccess(
  session: AppSession,
  projectId: string
) {
  if (!projectId) throw new ForbiddenError("Forbidden: no project access");

  const project = await prisma.project.findFirst({
    where: {
      id: projectId,
      companyId: session.membership.companyId,
    },
    select: { id: true, pmId: true },
  });
  if (!project) {
    throw new ForbiddenError("Forbidden: no project access");
  }

  const role = session.membership.role;
  if (
    role === Role.OWNER ||
    role === Role.CEO ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.BOOKKEEPER
  ) {
    return;
  }

  if (role === Role.PROJECT_MANAGER && project.pmId === session.user.id) {
    return;
  }

  const ids = await getAccessibleProjectIds(session);
  if (!ids.includes(projectId)) {
    throw new ForbiddenError("Forbidden: no project access");
  }
}

export async function assertCompanyAccess(
  session: AppSession,
  companyId: string
) {
  if (session.membership.companyId !== companyId) {
    throw new ForbiddenError();
  }
}

/** Lead must belong to the user's company; sales see assigned/unassigned only. */
export async function assertLeadAccess(session: AppSession, leadId: string) {
  const role = session.membership.role;
  const lead = await prisma.lead.findFirst({
    where: {
      id: leadId,
      companyId: session.membership.companyId,
      ...(role === Role.SALES_MANAGER
        ? {
            OR: [
              { assigneeId: session.user.id },
              { assigneeId: null },
            ],
          }
        : {}),
    },
    select: { id: true, assigneeId: true },
  });
  if (!lead) throw new ForbiddenError();
  return lead;
}

/** Contract access: linked project in company, or uploader within company staff roles. */
export async function assertContractAccess(
  session: AppSession,
  contractId: string
) {
  const contract = await prisma.purchaseContract.findUnique({
    where: { id: contractId },
    include: {
      project: { select: { id: true, companyId: true } },
    },
  });
  if (!contract) throw new ForbiddenError();

  if (contract.project) {
    if (contract.project.companyId !== session.membership.companyId) {
      throw new ForbiddenError();
    }
    await assertProjectAccess(session, contract.project.id);
    return contract;
  }

  if (contract.uploadedById === session.user.id) return contract;

  const role = session.membership.role;
  const allowed =
    role === Role.OWNER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER ||
    role === Role.SALES_MANAGER;
  if (!allowed) throw new ForbiddenError();

  const uploaderMembership = await prisma.membership.findFirst({
    where: {
      userId: contract.uploadedById,
      companyId: session.membership.companyId,
      isActive: true,
    },
  });
  if (!uploaderMembership && contract.uploadedById !== session.user.id) {
    throw new ForbiddenError();
  }
  return contract;
}

/** Target user must share an active membership in the actor's company. */
export async function assertCompanyUser(session: AppSession, userId: string) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      companyId: session.membership.companyId,
      isActive: true,
    },
  });
  if (!membership) throw new ForbiddenError();
  return membership;
}
