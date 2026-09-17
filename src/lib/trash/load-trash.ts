import { prisma } from "@/lib/db";
import {
  daysLeftInTrash,
  trashPurgeDeadline,
  TRASH_RETENTION_DAYS,
} from "@/lib/trash/constants";

export type TrashUserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  deletedAt: string;
  purgeAt: string;
  daysLeft: number;
};

export type TrashProjectRow = {
  id: string;
  name: string;
  status: string;
  deletedAt: string;
  purgeAt: string;
  daysLeft: number;
};

export type TrashData = {
  retentionDays: number;
  users: TrashUserRow[];
  projects: TrashProjectRow[];
};

export async function loadTrashData(companyId: string): Promise<TrashData> {
  const [users, projects] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: { not: null },
        memberships: { some: { companyId } },
      },
      select: {
        id: true,
        name: true,
        email: true,
        deletedAt: true,
        memberships: {
          where: { companyId },
          select: { role: true },
          take: 1,
        },
      },
      orderBy: { deletedAt: "desc" },
    }),
    prisma.project.findMany({
      where: { companyId, deletedAt: { not: null } },
      select: {
        id: true,
        name: true,
        status: true,
        deletedAt: true,
      },
      orderBy: { deletedAt: "desc" },
    }),
  ]);

  return {
    retentionDays: TRASH_RETENTION_DAYS,
    users: users
      .filter((u) => u.deletedAt)
      .map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.memberships[0]?.role ?? null,
        deletedAt: u.deletedAt!.toISOString(),
        purgeAt: trashPurgeDeadline(u.deletedAt!).toISOString(),
        daysLeft: daysLeftInTrash(u.deletedAt!),
      })),
    projects: projects
      .filter((p) => p.deletedAt)
      .map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        deletedAt: p.deletedAt!.toISOString(),
        purgeAt: trashPurgeDeadline(p.deletedAt!).toISOString(),
        daysLeft: daysLeftInTrash(p.deletedAt!),
      })),
  };
}
