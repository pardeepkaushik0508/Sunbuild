import { ProjectStatus, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  ACTIVE_PROJECT_STATUSES,
  COMPLETED_PROJECT_STATUSES,
  PLANNING_PROJECT_STATUSES,
  UPCOMING_DEADLINE_DAYS,
} from "@/lib/jobs/constants";
import type { AppSession } from "@/lib/session";

export type CompanyAccent = "blue" | "green" | "purple";

export type CompanyOverviewStats = {
  id: string;
  name: string;
  slug: string;
  brand: string | null;
  description: string | null;
  isActive: boolean;
  accent: CompanyAccent;
  href: string;
  users: number;
  activeProjects: number;
  completed: number;
  growthPercent: number;
  deadlines: number;
  revenue: number;
  revenueLabel: string;
};

const ACCENTS: CompanyAccent[] = ["blue", "green", "purple"];

const OPERATIONAL: ProjectStatus[] = [
  ...ACTIVE_PROJECT_STATUSES,
  ...PLANNING_PROJECT_STATUSES,
];

function formatCompactRevenue(amount: number): string {
  if (!amount || amount <= 0) return "$0";
  if (amount >= 1_000_000) {
    const m = amount / 1_000_000;
    return `$${m >= 10 ? m.toFixed(0) : m.toFixed(1).replace(/\.0$/, "")}M`;
  }
  if (amount >= 1_000) {
    const k = amount / 1_000;
    return `$${k >= 100 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")}K`;
  }
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function growthFromCounts(current: number, previous: number): number {
  if (previous <= 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function countMap(
  rows: Array<{ companyId: string; _count: number | { _all: number } }>
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const n =
      typeof row._count === "number" ? row._count : row._count._all;
    map.set(row.companyId, n);
  }
  return map;
}

/** Companies the Owner may oversee (all active membership companies). */
export function resolveOwnerCompanies(session: AppSession) {
  const seen = new Set<string>();
  const companies: Array<{ id: string; name: string }> = [];
  for (const m of session.memberships) {
    if (seen.has(m.companyId)) continue;
    seen.add(m.companyId);
    companies.push({ id: m.companyId, name: m.companyName });
  }
  if (companies.length === 0) {
    companies.push({
      id: session.membership.companyId,
      name: session.membership.companyName,
    });
  }
  return companies;
}

/**
 * Batched company overview stats — O(1) query groups instead of 7N per-company round-trips.
 */
export async function loadCompanyOverviewStats(
  companyIds: string[],
  options?: { jobsHrefBase?: string }
): Promise<CompanyOverviewStats[]> {
  if (companyIds.length === 0) return [];

  const jobsHrefBase = options?.jobsHrefBase ?? "/owner/jobs";
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadlineEnd = new Date(
    now.getTime() + UPCOMING_DEADLINE_DAYS * 86400000
  );
  const d30 = new Date(now.getTime() - 30 * 86400000);
  const d60 = new Date(now.getTime() - 60 * 86400000);
  const ids = { in: companyIds };

  const [
    companies,
    userGroups,
    projectStatusGroups,
    deadlineGroups,
    revenueGroups,
    createdLast30Groups,
    createdPrev30Groups,
  ] = await Promise.all([
    prisma.company.findMany({
      where: { id: ids, isActive: true },
      select: {
        id: true,
        name: true,
        slug: true,
        brand: true,
        description: true,
        isActive: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.membership.groupBy({
      by: ["companyId"],
      where: { companyId: ids, isActive: true },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["companyId", "status"],
      where: { companyId: ids },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["companyId"],
      where: {
        companyId: ids,
        targetClosing: { gte: now, lte: deadlineEnd },
        status: {
          notIn: [ProjectStatus.CANCELLED, ProjectStatus.HANDED_OVER],
        },
      },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["companyId"],
      where: {
        companyId: ids,
        status: { not: ProjectStatus.CANCELLED },
        purchasePrice: { not: null },
      },
      _sum: { purchasePrice: true },
    }),
    prisma.project.groupBy({
      by: ["companyId"],
      where: { companyId: ids, createdAt: { gte: d30 } },
      _count: { _all: true },
    }),
    prisma.project.groupBy({
      by: ["companyId"],
      where: { companyId: ids, createdAt: { gte: d60, lt: d30 } },
      _count: { _all: true },
    }),
  ]);

  const usersByCompany = countMap(userGroups);
  const deadlinesByCompany = countMap(deadlineGroups);
  const last30ByCompany = countMap(createdLast30Groups);
  const prev30ByCompany = countMap(createdPrev30Groups);

  const activeByCompany = new Map<string, number>();
  const completedByCompany = new Map<string, number>();
  const operational = new Set<ProjectStatus>(OPERATIONAL);
  const completedSet = new Set<ProjectStatus>(COMPLETED_PROJECT_STATUSES);

  for (const row of projectStatusGroups) {
    const n = row._count._all;
    if (operational.has(row.status)) {
      activeByCompany.set(
        row.companyId,
        (activeByCompany.get(row.companyId) ?? 0) + n
      );
    }
    if (completedSet.has(row.status)) {
      completedByCompany.set(
        row.companyId,
        (completedByCompany.get(row.companyId) ?? 0) + n
      );
    }
  }

  const revenueByCompany = new Map<string, number>();
  for (const row of revenueGroups) {
    revenueByCompany.set(row.companyId, row._sum.purchasePrice ?? 0);
  }

  const byId = new Map(companies.map((c) => [c.id, c]));
  const ordered = companyIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return ordered.map((company, index) => {
    const revenue = revenueByCompany.get(company.id) ?? 0;
    const createdLast30 = last30ByCompany.get(company.id) ?? 0;
    const createdPrev30 = prev30ByCompany.get(company.id) ?? 0;
    return {
      id: company.id,
      name: company.name,
      slug: company.slug,
      brand: company.brand,
      description: company.description,
      isActive: company.isActive,
      accent: ACCENTS[index % ACCENTS.length],
      href: `${jobsHrefBase}?companyId=${company.id}`,
      users: usersByCompany.get(company.id) ?? 0,
      activeProjects: activeByCompany.get(company.id) ?? 0,
      completed: completedByCompany.get(company.id) ?? 0,
      growthPercent: growthFromCounts(createdLast30, createdPrev30),
      deadlines: deadlinesByCompany.get(company.id) ?? 0,
      revenue,
      revenueLabel: formatCompactRevenue(revenue),
    } satisfies CompanyOverviewStats;
  });
}

/** Owner may only query companies they belong to. */
export function assertOwnerCompanyAccess(
  session: AppSession,
  companyId: string
) {
  const allowed = new Set(resolveOwnerCompanies(session).map((c) => c.id));
  if (!allowed.has(companyId)) {
    throw new Error("Company access denied");
  }
}

export function ownerHasRole(session: AppSession) {
  return (
    session.membership.role === Role.OWNER ||
    session.memberships.some((m) => m.role === Role.OWNER)
  );
}
