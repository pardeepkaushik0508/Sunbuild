import { Prisma, SelectionPackageStatus, SelectionSectionStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/** Non-draft packages that have at least one client-visible section. */
export const CLIENT_SELECTION_PACKAGE_STATUS_WHERE = {
  status: { not: SelectionPackageStatus.DRAFT },
} as const;

export function parseSelectionPriority(raw: string): "LOW" | "MEDIUM" | "HIGH" {
  const v = raw.trim().toUpperCase();
  if (v === "HIGH" || v === "LOW" || v === "MEDIUM") return v;
  return "MEDIUM";
}

export function parseSelectionStatus(
  raw: string
): SelectionSectionStatus | null {
  const v = raw.trim().toUpperCase();
  if (
    v === SelectionSectionStatus.DRAFT ||
    v === SelectionSectionStatus.SUBMITTED ||
    v === SelectionSectionStatus.CHANGES_REQUESTED ||
    v === SelectionSectionStatus.APPROVED ||
    v === SelectionSectionStatus.LOCKED
  ) {
    return v;
  }
  return null;
}

/**
 * Section IDs the client may see. Uses SQL so visibility is enforced even when
 * a stale Prisma Client (locked Windows generate / Turbopack) does not know
 * the `clientVisible` field yet.
 */
export async function getClientVisibleSectionIds(
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return [];
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT s.id
      FROM "SelectionSection" s
      INNER JOIN "SelectionPackage" p ON p.id = s."packageId"
      WHERE p."projectId" IN (${Prisma.join(projectIds)})
        AND s."clientVisible" = true
    `;
    return rows.map((r) => r.id);
  } catch (err) {
    console.warn("[selections] clientVisible SQL unavailable; hiding all", err);
    return [];
  }
}

export async function getSelectionImagesBySectionIds(sectionIds: string[]) {
  if (sectionIds.length === 0) {
    return [] as Array<{
      id: string;
      sectionId: string;
      filePath: string;
      caption: string | null;
      sortOrder: number;
      createdAt: Date;
    }>;
  }
  try {
    return await prisma.$queryRaw<
      Array<{
        id: string;
        sectionId: string;
        filePath: string;
        caption: string | null;
        sortOrder: number;
        createdAt: Date;
      }>
    >`
      SELECT id, "sectionId", "filePath", caption, "sortOrder", "createdAt"
      FROM "SelectionImage"
      WHERE "sectionId" IN (${Prisma.join(sectionIds)})
      ORDER BY "sortOrder" ASC
    `;
  } catch {
    return [];
  }
}

export async function isSectionClientVisible(sectionId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "SelectionSection"
      WHERE id = ${sectionId} AND "clientVisible" = true
    `;
    return rows.length > 0;
  } catch {
    return false;
  }
}

export function noneIdFilter() {
  return { id: { in: ["__none__"] } };
}

export function idInFilter(ids: string[]) {
  return ids.length > 0 ? { id: { in: ids } } : noneIdFilter();
}
