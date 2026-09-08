import { Role, Prisma } from "@prisma/client";
import type { InsightCard } from "@/components/dashboard/ai-insights";
import type { AppSession } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { canInviteRole } from "@/lib/authorization";
import { formatRelativeTime, initials } from "@/lib/utils";
import { buildUserInsights } from "@/lib/users/user-insights";

export type UserAccountStatus = "ACTIVE" | "INACTIVE" | "INVITED";

export type ManageUserProject = {
  id: string;
  name: string;
};

export type ManageUserRow = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  initials: string;
  status: UserAccountStatus;
  role: Role;
  roleLabel: string;
  projectCount: number;
  projects: ManageUserProject[];
  lastActivityAt: string | null;
  lastActivityLabel: string;
  createdAt: string;
  updatedAt: string;
  canEditSettings: boolean;
  financeAccess: boolean;
  isSelf: boolean;
};

export type ManageUsersFilters = {
  q?: string;
  role?: Role | "ALL";
  status?: UserAccountStatus | "ALL";
  projectId?: string;
  sort?: "name" | "role" | "status" | "activity" | "created";
  page?: number;
  pageSize?: number;
};

export type ManageUsersData = {
  company: {
    id: string;
    name: string;
    brand: string | null;
    slug: string;
    isActive: boolean;
  };
  stats: {
    activeUsers: number;
    inactiveUsers: number;
    projectManagers: number;
    subcontractors: number;
  };
  users: ManageUserRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filters: {
    q: string;
    role: Role | "ALL";
    status: UserAccountStatus | "ALL";
    projectId: string;
    sort: NonNullable<ManageUsersFilters["sort"]>;
  };
  projects: ManageUserProject[];
  insights: InsightCard[];
  inviteRoles: Role[];
  currentUserId: string;
};

const ROLE_PRIORITY: Role[] = [
  Role.OWNER,
  Role.CEO,
  Role.OPERATIONS_ADMIN,
  Role.SALES_MANAGER,
  Role.PROJECT_MANAGER,
  Role.BOOKKEEPER,
  Role.SUBCONTRACTOR,
  Role.CLIENT,
];

function roleRank(role: Role) {
  const i = ROLE_PRIORITY.indexOf(role);
  return i === -1 ? 99 : i;
}

function parseRoleFilter(value?: string): Role | "ALL" {
  if (!value || value === "ALL") return "ALL";
  if ((Object.values(Role) as string[]).includes(value)) return value as Role;
  return "ALL";
}

function parseStatusFilter(value?: string): UserAccountStatus | "ALL" {
  if (!value || value === "ALL") return "ALL";
  if (value === "ACTIVE" || value === "INACTIVE" || value === "INVITED") {
    return value;
  }
  return "ALL";
}

function parseSort(
  value?: string
): NonNullable<ManageUsersFilters["sort"]> {
  if (
    value === "name" ||
    value === "role" ||
    value === "status" ||
    value === "activity" ||
    value === "created"
  ) {
    return value;
  }
  return "name";
}

export async function loadManageUsersData(
  session: AppSession,
  filters: ManageUsersFilters = {}
): Promise<ManageUsersData> {
  const companyId = session.membership.companyId;
  const q = filters.q?.trim() ?? "";
  const roleFilter = parseRoleFilter(filters.role);
  const statusFilter = parseStatusFilter(filters.status);
  const projectId = filters.projectId?.trim() ?? "";
  const sort = parseSort(filters.sort);
  const pageSize = Math.min(Math.max(filters.pageSize ?? 20, 5), 100);
  const page = Math.max(filters.page ?? 1, 1);

  const company = await prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      brand: true,
      slug: true,
      isActive: true,
    },
  });

  const membershipWhere: Prisma.MembershipWhereInput = {
    companyId,
  };

  if (roleFilter !== "ALL") {
    membershipWhere.role = roleFilter;
  }

  if (q) {
    membershipWhere.OR = [
      { user: { name: { contains: q } } },
      { user: { email: { contains: q } } },
      { user: { phone: { contains: q } } },
    ];
    // Role label search (best-effort against enum keys / labels)
    const roleMatches = (Object.values(Role) as Role[]).filter((role) => {
      const label = ROLE_LABELS[role].toLowerCase();
      const key = role.toLowerCase().replace(/_/g, " ");
      const needle = q.toLowerCase();
      return label.includes(needle) || key.includes(needle);
    });
    if (roleMatches.length > 0) {
      membershipWhere.OR.push({ role: { in: roleMatches } });
    }
  }

  if (projectId) {
    const projectClause: Prisma.MembershipWhereInput = {
      user: {
        OR: [
          { projectAccess: { some: { projectId } } },
          { assignedProjects: { some: { id: projectId, companyId } } },
        ],
      },
    };
    membershipWhere.AND = [
      ...(Array.isArray(membershipWhere.AND) ? membershipWhere.AND : []),
      projectClause,
    ];
  }

  // Phase 1: lean memberships for filter/sort/pagination (no project trees)
  const allMemberships = await prisma.membership.findMany({
    where: membershipWhere,
    select: {
      id: true,
      userId: true,
      role: true,
      isActive: true,
      canEditSettings: true,
      financeAccess: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          image: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          sessions: {
            select: { updatedAt: true, createdAt: true },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });

  const emails = [...new Set(allMemberships.map((m) => m.user.email))];
  const pendingInvites =
    emails.length === 0
      ? []
      : await prisma.invitation.findMany({
          where: {
            companyId,
            email: { in: emails },
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { email: true },
        });
  const invitedEmails = new Set(pendingInvites.map((i) => i.email.toLowerCase()));

  // One row per user — keep highest-privilege membership
  const byUser = new Map<string, (typeof allMemberships)[number]>();
  for (const m of allMemberships) {
    const existing = byUser.get(m.userId);
    if (!existing || roleRank(m.role) < roleRank(existing.role)) {
      byUser.set(m.userId, m);
    }
  }

  type LeanRow = {
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    phone: string | null;
    image: string | null;
    status: UserAccountStatus;
    role: Role;
    lastActivityAt: string | null;
    createdAt: string;
    updatedAt: string;
    canEditSettings: boolean;
    financeAccess: boolean;
    isSelf: boolean;
  };

  let leanRows: LeanRow[] = [...byUser.values()].map((m) => {
    const lastSession = m.user.sessions[0];
    const lastActivityAt = lastSession
      ? lastSession.updatedAt ?? lastSession.createdAt
      : null;

    const hasPendingInvite = invitedEmails.has(m.user.email.toLowerCase());
    const neverLoggedIn = m.user.sessions.length === 0;

    let status: UserAccountStatus = "ACTIVE";
    if (!m.user.isActive || !m.isActive) {
      status = "INACTIVE";
    } else if (hasPendingInvite && neverLoggedIn) {
      status = "INVITED";
    }

    return {
      membershipId: m.id,
      userId: m.user.id,
      name: m.user.name,
      email: m.user.email,
      phone: m.user.phone,
      image: m.user.image,
      status,
      role: m.role,
      lastActivityAt: lastActivityAt?.toISOString() ?? null,
      createdAt: m.user.createdAt.toISOString(),
      updatedAt: m.user.updatedAt.toISOString(),
      canEditSettings: m.canEditSettings,
      financeAccess: m.financeAccess,
      isSelf: m.user.id === session.user.id,
    };
  });

  if (statusFilter !== "ALL") {
    leanRows = leanRows.filter((r) => r.status === statusFilter);
  }

  leanRows.sort((a, b) => {
    switch (sort) {
      case "role":
        return roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name);
      case "status":
        return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
      case "activity": {
        const at = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const bt = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return bt - at || a.name.localeCompare(b.name);
      }
      case "created":
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() ||
          a.name.localeCompare(b.name)
        );
      case "name":
      default:
        return a.name.localeCompare(b.name);
    }
  });

  const total = leanRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedLean = leanRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );
  const pagedUserIds = pagedLean.map((r) => r.userId);

  // Phase 2: project assignments only for the current page
  const projectUsers =
    pagedUserIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: pagedUserIds } },
          select: {
            id: true,
            projectAccess: {
              where: { project: { companyId } },
              select: {
                project: { select: { id: true, name: true } },
              },
            },
            assignedProjects: {
              where: { companyId },
              select: { id: true, name: true },
            },
          },
        });

  const projectsByUser = new Map<string, ManageUserProject[]>();
  for (const u of projectUsers) {
    const projectMap = new Map<string, ManageUserProject>();
    for (const a of u.projectAccess) {
      projectMap.set(a.project.id, a.project);
    }
    for (const p of u.assignedProjects) {
      projectMap.set(p.id, p);
    }
    projectsByUser.set(
      u.id,
      [...projectMap.values()].sort((a, b) => a.name.localeCompare(b.name))
    );
  }

  const paged: ManageUserRow[] = pagedLean.map((r) => {
    const projects = projectsByUser.get(r.userId) ?? [];
    return {
      membershipId: r.membershipId,
      userId: r.userId,
      name: r.name,
      email: r.email,
      phone: r.phone,
      image: r.image,
      initials: initials(r.name),
      status: r.status,
      role: r.role,
      roleLabel: ROLE_LABELS[r.role],
      projectCount: projects.length,
      projects,
      lastActivityAt: r.lastActivityAt,
      lastActivityLabel: formatRelativeTime(
        r.lastActivityAt ? new Date(r.lastActivityAt) : null
      ),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      canEditSettings: r.canEditSettings,
      financeAccess: r.financeAccess,
      isSelf: r.isSelf,
    };
  });

  // Company-wide stats (unfiltered — always reflect live DB)
  const [activeUsers, inactiveUsers, projectManagers, subcontractors, projects] =
    await Promise.all([
      prisma.membership.count({
        where: {
          companyId,
          isActive: true,
          user: { isActive: true },
        },
      }),
      prisma.membership.count({
        where: {
          companyId,
          OR: [{ isActive: false }, { user: { isActive: false } }],
        },
      }),
      prisma.membership.count({
        where: {
          companyId,
          role: Role.PROJECT_MANAGER,
          isActive: true,
          user: { isActive: true },
        },
      }),
      prisma.membership.count({
        where: {
          companyId,
          role: Role.SUBCONTRACTOR,
          isActive: true,
          user: { isActive: true },
        },
      }),
      prisma.project.findMany({
        where: { companyId },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 300,
      }),
    ]);

  // Prefer distinct users for active/inactive when multi-role memberships exist
  const distinctActive = await prisma.user.count({
    where: {
      isActive: true,
      memberships: { some: { companyId, isActive: true } },
    },
  });
  const distinctInactive = await prisma.user.count({
    where: {
      memberships: { some: { companyId } },
      OR: [
        { isActive: false },
        { memberships: { some: { companyId, isActive: false } } },
      ],
    },
  });

  const inviteRoles = (Object.values(Role) as Role[]).filter((role) =>
    canInviteRole(session.membership.role, role)
  );

  const [pendingInviteCount, inactivePrivileged, assignmentCounts] =
    await Promise.all([
      prisma.invitation.count({
        where: {
          companyId,
          acceptedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      prisma.membership.count({
        where: {
          companyId,
          role: {
            in: [
              Role.OWNER,
              Role.CEO,
              Role.OPERATIONS_ADMIN,
              Role.PROJECT_MANAGER,
            ],
          },
          OR: [{ isActive: false }, { user: { isActive: false } }],
        },
      }),
      prisma.projectAccess.groupBy({
        by: ["userId"],
        where: { project: { companyId } },
        _count: { _all: true },
      }),
    ]);

  const overloaded = assignmentCounts.filter((r) => r._count._all >= 8).length;

  const insights = buildUserInsights({
    pendingInviteCount,
    inactivePrivilegedCount: inactivePrivileged,
    overloadedAssignmentCount: overloaded,
    inactiveUserCount: distinctInactive,
  });

  return {
    company,
    stats: {
      activeUsers: distinctActive || activeUsers,
      inactiveUsers: distinctInactive || inactiveUsers,
      projectManagers,
      subcontractors,
    },
    users: paged,
    pagination: {
      page: safePage,
      pageSize,
      total,
      totalPages,
    },
    filters: {
      q,
      role: roleFilter,
      status: statusFilter,
      projectId,
      sort,
    },
    projects,
    insights,
    inviteRoles,
    currentUserId: session.user.id,
  };
}
