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
import { getSessionTimeoutMinutes } from "@/lib/settings/store";

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

function sessionUpdatedAtMs(value: Date | string | number | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

/**
 * Request-scoped session load (deduped via React.cache).
 * Prevents RoleShell + page + loaders from re-querying auth/membership.
 * Also enforces company idle session timeout against session.updatedAt.
 */
const loadAppSession = cache(async (): Promise<AppSession | null> => {
  const headerList = await headers();
  // Avoid Better Auth sliding-refresh before we evaluate idle timeout.
  const session = await auth.api.getSession({
    headers: headerList,
    query: {
      disableRefresh: true,
      disableCookieCache: true,
    },
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
      deletedAt: true,
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

  if (!user || !user.isActive || user.deletedAt) return null;

  const activeMemberships = user.memberships.filter(
    (m) => m.company.isActive && isCompanyVisibleInMvp(m.company.slug)
  );
  if (activeMemberships.length === 0) return null;

  const preferredId = await getActiveMembershipCookie();
  const membership =
    activeMemberships.find((m) => m.id === preferredId) ??
    activeMemberships[0];

  const timeoutMinutes = await getSessionTimeoutMinutes(membership.company.id);
  const lastActiveMs = sessionUpdatedAtMs(session.session.updatedAt);
  const idleMs = Math.max(1, timeoutMinutes) * 60 * 1000;
  if (!lastActiveMs || Date.now() - lastActiveMs >= idleMs) {
    await prisma.session
      .deleteMany({ where: { token: session.session.token } })
      .catch(() => undefined);
    return null;
  }

  // Record activity so the idle window slides while the user keeps using the app.
  await prisma.session
    .updateMany({
      where: { token: session.session.token },
      data: { updatedAt: new Date() },
    })
    .catch(() => undefined);

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
      where: { companyId, deletedAt: null },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  // Only the currently assigned PM (project.pmId) can see the project.
  // Stale ProjectAccess rows from a previous PM must not grant visibility.
  if (role === Role.PROJECT_MANAGER) {
    const projects = await prisma.project.findMany({
      where: { companyId, pmId: userId, deletedAt: null },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  if (role === Role.SALES_MANAGER) {
    const projects = await prisma.project.findMany({
      where: {
        companyId,
        deletedAt: null,
        access: { some: { userId } },
      },
      select: { id: true },
    });
    return projects.map((p) => p.id);
  }

  if (role === Role.SERVICE_COORDINATOR) {
    const [ticketProjects, access] = await Promise.all([
      prisma.warrantyTicket.findMany({
        where: { project: { companyId, deletedAt: null } },
        select: { projectId: true },
        distinct: ["projectId"],
      }),
      prisma.projectAccess.findMany({
        where: { userId, project: { companyId, deletedAt: null } },
        select: { projectId: true },
      }),
    ]);
    return [...new Set([...ticketProjects.map((t) => t.projectId), ...access.map((a) => a.projectId)])];
  }

  const access = await prisma.projectAccess.findMany({
    where: {
      userId,
      project: { companyId, deletedAt: null },
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
      deletedAt: null,
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
              { createdById: session.user.id },
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

/** Contract access: same-company staff, linked project ACL, or original uploader. */
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

  const companyId = session.membership.companyId;
  const role = session.membership.role;
  const tenantId = contract.companyId ?? contract.project?.companyId ?? null;

  if (tenantId && tenantId !== companyId) {
    throw new ForbiddenError();
  }

  // Project-linked contracts use project ACL (staff + assigned client).
  if (contract.projectId) {
    await assertProjectAccess(session, contract.projectId);
    return contract;
  }

  if (contract.uploadedById === session.user.id) return contract;

  const staff =
    role === Role.OWNER ||
    role === Role.CEO ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER ||
    role === Role.SALES_MANAGER;

  if (!staff) throw new ForbiddenError();

  // Explicit company match — company staff can open the workspace/print/PDF.
  if (contract.companyId === companyId) return contract;

  // Legacy rows with null companyId: allow company staff when uploader is in-tenant
  // (or owner/ops/ceo even if uploader membership was removed).
  if (contract.companyId == null) {
    if (
      role === Role.OWNER ||
      role === Role.CEO ||
      role === Role.OPERATIONS_ADMIN
    ) {
      return contract;
    }
    const uploaderMembership = await prisma.membership.findFirst({
      where: {
        userId: contract.uploadedById,
        companyId,
        isActive: true,
      },
      select: { id: true },
    });
    if (uploaderMembership) return contract;
  }

  throw new ForbiddenError();
}

/** Target user must be an active Subcontractor in the actor's company. */
export async function assertCompanySubcontractor(
  session: AppSession,
  userId: string
) {
  const membership = await prisma.membership.findFirst({
    where: {
      userId,
      companyId: session.membership.companyId,
      isActive: true,
      role: Role.SUBCONTRACTOR,
    },
  });
  if (!membership) {
    throw new ForbiddenError("Assignee must be a subcontractor");
  }
  return membership;
}

/**
 * Subcontractor must belong to the company and already have ProjectAccess
 * on the given project (PM can only assign work to project-available subs).
 */
export async function assertProjectSubcontractor(
  session: AppSession,
  userId: string,
  projectId: string
) {
  await assertCompanySubcontractor(session, userId);
  const access = await prisma.projectAccess.findFirst({
    where: { projectId, userId },
    select: { id: true },
  });
  if (!access) {
    throw new ForbiddenError(
      "Subcontractor must be assigned to this project first"
    );
  }
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
