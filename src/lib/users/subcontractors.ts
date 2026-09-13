import { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toPersonOption, type PersonOption } from "@/lib/users/person-label";

/**
 * Company-wide active subcontractors (for assigning subs onto a project).
 */
export async function loadCompanySubcontractors(
  companyId: string
): Promise<PersonOption[]> {
  const memberships = await prisma.membership.findMany({
    where: {
      companyId,
      isActive: true,
      role: Role.SUBCONTRACTOR,
      user: { isActive: true },
    },
    include: {
      user: { select: { id: true, name: true, trade: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  return memberships.map((m) =>
    toPersonOption({
      id: m.user.id,
      name: m.user.name,
      role: Role.SUBCONTRACTOR,
      trade: m.user.trade,
    })
  );
}

/**
 * Subcontractors already on the given projects (via ProjectAccess).
 * Used for task / warranty / daily-log assignee dropdowns.
 */
export async function loadProjectSubcontractors(opts: {
  companyId: string;
  projectIds: string[];
}): Promise<PersonOption[]> {
  const { companyId, projectIds } = opts;
  if (projectIds.length === 0) return [];

  const accessRows = await prisma.projectAccess.findMany({
    where: {
      projectId: { in: projectIds },
      user: {
        isActive: true,
        memberships: {
          some: {
            companyId,
            role: Role.SUBCONTRACTOR,
            isActive: true,
          },
        },
      },
    },
    select: {
      projectId: true,
      user: { select: { id: true, name: true, trade: true } },
    },
  });

  const byUser = new Map<
    string,
    { id: string; name: string; trade: string | null; projectIds: string[] }
  >();

  for (const row of accessRows) {
    const existing = byUser.get(row.user.id);
    if (existing) {
      if (!existing.projectIds.includes(row.projectId)) {
        existing.projectIds.push(row.projectId);
      }
      continue;
    }
    byUser.set(row.user.id, {
      id: row.user.id,
      name: row.user.name,
      trade: row.user.trade,
      projectIds: [row.projectId],
    });
  }

  return [...byUser.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((u) =>
      toPersonOption({
        id: u.id,
        name: u.name,
        role: Role.SUBCONTRACTOR,
        trade: u.trade,
        projectIds: u.projectIds,
      })
    );
}
