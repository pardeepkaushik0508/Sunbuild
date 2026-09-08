import { cache } from "react";
import {
  DepositStatus,
  InvoiceStatus,
  ProjectStatus,
  Role,
  ScheduleStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AppSession } from "@/lib/session";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { computeBudgetUtilization } from "@/lib/jobs/budget";
import {
  ACTIVE_PROJECT_STATUSES,
  BUDGET_WARNING_PERCENT,
  COMPLETED_PROJECT_STATUSES,
  JOBS_PAGE_SIZE,
  PLANNING_PROJECT_STATUSES,
  UPCOMING_DEADLINE_DAYS,
  type JobsSortKey,
  type JobsStatusFilter,
} from "@/lib/jobs/constants";
import {
  buildProjectInsights,
  depositOpenStatuses,
} from "@/lib/insights";
import { fullName } from "@/lib/utils";
import { hasFinanceAccess } from "@/lib/permissions";
import type { InsightCard } from "@/components/dashboard/ai-insights";

export type JobsCompanyOption = {
  id: string;
  name: string;
};

export type JobsListItem = {
  id: string;
  name: string;
  municipalAddress: string | null;
  status: ProjectStatus;
  progressPercent: number;
  pmName: string | null;
  pmId: string | null;
  clientName: string | null;
  deadline: Date | null;
  budgetUsed: number;
  budgetTotal: number;
  budgetPercent: number;
  hasBudget: boolean;
  updatedAt: Date;
  href: string;
};

export type JobsStatistics = {
  activeProjects: number;
  completed: number;
  inPlanning: number;
  upcomingDeadlines: number;
};

export type JobsDashboardData = {
  company: {
    id: string;
    name: string;
    brand: string | null;
    slug: string | null;
    isActive: boolean;
  };
  companies: JobsCompanyOption[];
  selectedCompanyId: string;
  stats: JobsStatistics;
  jobs: JobsListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  search: string;
  statusFilter: JobsStatusFilter;
  sort: JobsSortKey;
  pmFilter: string;
  clientFilter: string;
  pmOptions: Array<{ id: string; name: string }>;
  clientOptions: Array<{ id: string; name: string }>;
  insights: InsightCard[];
  canCreateJob: boolean;
  canConfigure: boolean;
  canViewBudget: boolean;
  canManageSchedule: boolean;
  createJobHref: string;
  scheduleHref: string;
  reportsHref: string;
  budgetOverviewHref: string;
  basePath: "/owner/jobs" | "/pm/projects";
};

function upcomingWindowEnd() {
  return new Date(Date.now() + UPCOMING_DEADLINE_DAYS * 86400000);
}

function upcomingWindowStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Resolve company scope from memberships (future multi-company ready). */
export function resolveJobsCompany(
  session: AppSession,
  requestedCompanyId?: string | null
) {
  const companies: JobsCompanyOption[] = [];
  const seen = new Set<string>();
  for (const m of session.memberships) {
    if (seen.has(m.companyId)) continue;
    seen.add(m.companyId);
    companies.push({ id: m.companyId, name: m.companyName });
  }

  const selected =
    (requestedCompanyId &&
      companies.find((c) => c.id === requestedCompanyId)) ||
    companies.find((c) => c.id === session.membership.companyId) ||
    companies[0];

  if (!selected) {
    throw new Error("No company membership");
  }

  const membershipForCompany =
    session.memberships.find((m) => m.companyId === selected.id) ??
    session.membership;

  return {
    companies,
    selectedCompanyId: selected.id,
    role: membershipForCompany.role as Role,
  };
}

/** Request-scoped; avoids duplicate project-id scans within the same Jobs load. */
const accessibleProjectIdsForCompany = cache(
  async (session: AppSession, companyId: string, role: Role) => {
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

    // Other internal roles with Jobs Management should not see unrestricted data
    return [] as string[];
  }
);

function statusWhere(
  filter: JobsStatusFilter
): { status?: ProjectStatus | { in: ProjectStatus[] } } {
  switch (filter) {
    case "active":
      return { status: { in: ACTIVE_PROJECT_STATUSES } };
    case "planning":
      return { status: { in: PLANNING_PROJECT_STATUSES } };
    case "completed":
      return { status: { in: COMPLETED_PROJECT_STATUSES } };
    case "on_hold":
      return { status: ProjectStatus.ON_HOLD };
    default:
      return {};
  }
}

export async function loadJobsDashboardData(input: {
  session: AppSession;
  basePath: "/owner/jobs" | "/pm/projects";
  companyId?: string | null;
  search?: string | null;
  status?: string | null;
  sort?: string | null;
  page?: string | null;
  pmId?: string | null;
  clientId?: string | null;
}): Promise<JobsDashboardData> {
  const { session, basePath } = input;
  const { companies, selectedCompanyId, role } = resolveJobsCompany(
    session,
    input.companyId
  );

  const search = (input.search ?? "").trim();
  const statusFilter = (input.status as JobsStatusFilter) || "all";
  const sort = (input.sort as JobsSortKey) || "updated";
  const page = Math.max(1, Number(input.page) || 1);
  const pmFilter = input.pmId ?? "";
  const clientFilter = input.clientId ?? "";

  const projectIds = await accessibleProjectIdsForCompany(
    session,
    selectedCompanyId,
    role
  );

  const company = await prisma.company.findUnique({
    where: { id: selectedCompanyId },
    select: { id: true, name: true, brand: true, slug: true, isActive: true },
  });

  const now = upcomingWindowStart();
  const deadlineEnd = upcomingWindowEnd();

  const baseWhere = {
    id: { in: projectIds },
    companyId: selectedCompanyId,
  };

  const [
    activeProjects,
    completed,
    inPlanning,
    upcomingDeadlines,
    delayedCount,
    depositsOpen,
    pendingDocs,
    overdueTasks,
    openRfis,
    pmMemberships,
  ] = await Promise.all([
    prisma.project.count({
      where: { ...baseWhere, status: { in: ACTIVE_PROJECT_STATUSES } },
    }),
    prisma.project.count({
      where: { ...baseWhere, status: { in: COMPLETED_PROJECT_STATUSES } },
    }),
    prisma.project.count({
      where: { ...baseWhere, status: { in: PLANNING_PROJECT_STATUSES } },
    }),
    prisma.project.count({
      where: {
        ...baseWhere,
        targetClosing: { gte: now, lte: deadlineEnd },
        status: {
          notIn: [ProjectStatus.CANCELLED, ProjectStatus.HANDED_OVER],
        },
      },
    }),
    prisma.scheduleItem.count({
      where: {
        projectId: { in: projectIds },
        status: ScheduleStatus.DELAYED,
      },
    }),
    prisma.deposit.aggregate({
      where: {
        projectId: { in: projectIds },
        status: { in: depositOpenStatuses() },
      },
      _sum: { amount: true },
    }),
    prisma.document.count({
      where: { projectId: { in: projectIds } },
    }),
    prisma.task.count({
      where: {
        projectId: { in: projectIds },
        dueDate: { lt: now },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
    }),
    prisma.rFI.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.membership.findMany({
      where: {
        companyId: selectedCompanyId,
        isActive: true,
        role: Role.PROJECT_MANAGER,
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const listWhere = {
    ...baseWhere,
    ...statusWhere(statusFilter),
    ...(pmFilter ? { pmId: pmFilter } : {}),
    ...(clientFilter ? { buyerId: clientFilter } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { municipalAddress: { contains: search } },
            { legalAddress: { contains: search } },
            { lotInfo: { contains: search } },
            {
              buyer: {
                OR: [
                  { firstName: { contains: search } },
                  { lastName: { contains: search } },
                ],
              },
            },
            { pm: { name: { contains: search } } },
          ],
        }
      : {}),
  };

  const totalCount = await prisma.project.count({ where: listWhere });
  const totalPages = Math.max(1, Math.ceil(totalCount / JOBS_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  // Fetch a larger set when sorting by computed fields (progress/budget)
  const needsComputedSort = sort === "progress" || sort === "budget";
  const orderBy =
    sort === "name"
      ? ({ name: "asc" } as const)
      : sort === "deadline"
        ? ({ targetClosing: "asc" } as const)
        : ({ updatedAt: "desc" } as const);

  const rawProjects = await prisma.project.findMany({
    where: listWhere,
    select: {
      id: true,
      name: true,
      municipalAddress: true,
      status: true,
      progressPercent: true,
      purchasePrice: true,
      targetClosing: true,
      updatedAt: true,
      pmId: true,
      pm: { select: { id: true, name: true } },
      buyer: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
    orderBy: needsComputedSort ? { updatedAt: "desc" } : orderBy,
    ...(needsComputedSort
      ? {}
      : {
          skip: (safePage - 1) * JOBS_PAGE_SIZE,
          take: JOBS_PAGE_SIZE,
        }),
    ...(needsComputedSort ? { take: 500 } : {}),
  });

  const pageProjectIds = rawProjects.map((p) => p.id);
  const [invoiceSums, depositSums] =
    pageProjectIds.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.invoice.groupBy({
            by: ["projectId"],
            where: {
              projectId: { in: pageProjectIds },
              status: InvoiceStatus.PAID,
            },
            _sum: { amount: true },
          }),
          prisma.deposit.groupBy({
            by: ["projectId"],
            where: {
              projectId: { in: pageProjectIds },
              status: DepositStatus.RECEIVED,
            },
            _sum: { amount: true },
          }),
        ]);

  const invoiceByProject = new Map(
    invoiceSums.map((r) => [r.projectId, r._sum.amount ?? 0])
  );
  const depositByProject = new Map(
    depositSums.map((r) => [r.projectId, r._sum.amount ?? 0])
  );

  let mapped: JobsListItem[] = rawProjects.map((p) => {
    const progressPercent = computeProjectProgress({
      progressPercent: p.progressPercent,
    });
    const paid = invoiceByProject.get(p.id) ?? 0;
    const received = depositByProject.get(p.id) ?? 0;
    const budget = computeBudgetUtilization({
      purchasePrice: p.purchasePrice,
      invoices: paid > 0 ? [{ amount: paid, status: "PAID" }] : [],
      deposits:
        received > 0 ? [{ amount: received, status: "RECEIVED" }] : [],
    });
    return {
      id: p.id,
      name: p.name,
      municipalAddress: p.municipalAddress,
      status: p.status,
      progressPercent,
      pmName: p.pm?.name ?? null,
      pmId: p.pmId,
      clientName: p.buyer
        ? fullName(p.buyer.firstName, p.buyer.lastName)
        : null,
      deadline: p.targetClosing,
      budgetUsed: budget.used,
      budgetTotal: budget.total,
      budgetPercent: budget.percent,
      hasBudget: budget.hasBudget,
      updatedAt: p.updatedAt,
      href: `/pm/projects/${p.id}`,
    };
  });

  if (sort === "progress") {
    mapped = mapped.sort((a, b) => b.progressPercent - a.progressPercent);
  } else if (sort === "budget") {
    mapped = mapped.sort((a, b) => b.budgetPercent - a.budgetPercent);
  }

  const pageJobs = needsComputedSort
    ? mapped.slice((safePage - 1) * JOBS_PAGE_SIZE, safePage * JOBS_PAGE_SIZE)
    : mapped;

  // Distinct PM/client options without loading every project row
  const [pmAssigned, buyers] = await Promise.all([
    prisma.project.findMany({
      where: { ...baseWhere, pmId: { not: null } },
      distinct: ["pmId"],
      select: {
        pmId: true,
        pm: { select: { id: true, name: true } },
      },
      take: 100,
    }),
    prisma.project.findMany({
      where: { ...baseWhere, buyerId: { not: null } },
      distinct: ["buyerId"],
      select: {
        buyerId: true,
        buyer: { select: { id: true, firstName: true, lastName: true } },
      },
      take: 100,
    }),
  ]);

  const pmMap = new Map<string, string>();
  const clientMap = new Map<string, string>();
  for (const m of pmMemberships) {
    pmMap.set(m.user.id, m.user.name);
  }
  for (const p of pmAssigned) {
    if (p.pm?.id) pmMap.set(p.pm.id, p.pm.name);
  }
  for (const p of buyers) {
    if (p.buyer?.id) {
      clientMap.set(
        p.buyer.id,
        fullName(p.buyer.firstName, p.buyer.lastName)
      );
    }
  }

  const canViewBudget = hasFinanceAccess(
    role,
    session.membership.financeAccess
  );

  // Budget overrun insights (rule-based)
  const insights = buildProjectInsights({
    delayedScheduleCount: delayedCount,
    expectedDepositAmount: depositsOpen._sum.amount ?? 0,
    pendingDocCount: Math.min(pendingDocs, 12),
    overdueTaskCount: overdueTasks,
    openRfiCount: openRfis,
  });

  const budgetHref =
    basePath === "/owner/jobs" ? "/owner/jobs/budget" : "/pm/projects/budget";

  const overBudgetCount = mapped.filter(
    (j) => j.hasBudget && j.budgetPercent >= BUDGET_WARNING_PERCENT
  ).length;
  if (overBudgetCount > 0 && canViewBudget) {
    insights.unshift({
      id: "budget-risk",
      category: "Budget",
      severity: "HIGH",
      message: `${overBudgetCount} project(s) at or above ${BUDGET_WARNING_PERCENT}% budget utilization`,
      href: budgetHref,
      actionLabel: "View Details",
    });
  }

  if (upcomingDeadlines > 0) {
    insights.push({
      id: "deadline-risk",
      category: "Deadlines",
      severity: "MEDIUM",
      message: `${upcomingDeadlines} project deadline(s) within ${UPCOMING_DEADLINE_DAYS} days`,
      href: `${basePath}?sort=deadline`,
      actionLabel: "View Details",
    });
  }

  const canCreateJob =
    role === Role.OWNER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER ||
    role === Role.SALES_MANAGER;

  const canConfigure =
    role === Role.OWNER ||
    role === Role.CEO ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER;

  const canManageSchedule =
    role === Role.OWNER ||
    role === Role.OPERATIONS_ADMIN ||
    role === Role.PROJECT_MANAGER ||
    role === Role.CEO;

  return {
    company: {
      id: company?.id ?? selectedCompanyId,
      name: company?.name ?? "Organization",
      brand: company?.brand ?? null,
      slug: company?.slug ?? null,
      isActive: company?.isActive ?? true,
    },
    companies,
    selectedCompanyId,
    stats: {
      activeProjects,
      completed,
      inPlanning,
      upcomingDeadlines,
    },
    jobs: pageJobs,
    totalCount,
    page: safePage,
    pageSize: JOBS_PAGE_SIZE,
    totalPages,
    search,
    statusFilter,
    sort,
    pmFilter,
    clientFilter,
    pmOptions: [...pmMap.entries()].map(([id, name]) => ({ id, name })),
    clientOptions: [...clientMap.entries()].map(([id, name]) => ({
      id,
      name,
    })),
    insights: insights.slice(0, 3),
    canCreateJob,
    canConfigure,
    canViewBudget,
    canManageSchedule,
    createJobHref: "/pm/contracts/new",
    scheduleHref: "/pm/schedule",
    reportsHref:
      basePath === "/owner/jobs" ? "/owner/jobs/reports" : "/pm/projects/reports",
    budgetOverviewHref:
      basePath === "/owner/jobs" ? "/owner/jobs/budget" : "/pm/projects/budget",
    basePath,
  };
}
