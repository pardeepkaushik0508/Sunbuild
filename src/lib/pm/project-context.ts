import { cookies } from "next/headers";
import type { AppSession } from "@/lib/session";
import { getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";

export const PM_PROJECT_COOKIE = "sb-pm-project-id";

export async function getSelectedProjectId(
  session: AppSession,
  searchParam?: string | null
): Promise<string | null> {
  const accessible = await getAccessibleProjectIds(session);
  if (accessible.length === 0) return null;

  if (searchParam && accessible.includes(searchParam)) {
    return searchParam;
  }

  const jar = await cookies();
  const fromCookie = jar.get(PM_PROJECT_COOKIE)?.value;
  if (fromCookie && accessible.includes(fromCookie)) {
    return fromCookie;
  }

  return accessible[0] ?? null;
}

export async function resolveSelectedProject(
  session: AppSession,
  searchParam?: string | null
) {
  const id = await getSelectedProjectId(session, searchParam);
  if (!id) return null;
  return prisma.project.findFirst({
    where: { id },
    include: {
      buyer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      },
      pm: { select: { id: true, name: true } },
      _count: {
        select: {
          tasks: true,
          access: true,
          milestones: true,
        },
      },
    },
  });
}

export function withProjectQuery(href: string, projectId: string | null) {
  if (!projectId) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}projectId=${encodeURIComponent(projectId)}`;
}
