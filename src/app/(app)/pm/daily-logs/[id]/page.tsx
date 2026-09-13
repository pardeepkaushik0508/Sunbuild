import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { DailyLogDetailView } from "@/components/daily-logs/daily-log-detail-view";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function PMDailyLogDetailPage({ params }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
  ]);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);

  const log = await prisma.dailyLog.findFirst({
    where: {
      id,
      projectId: { in: projectIds },
    },
    include: {
      project: { select: { id: true, name: true } },
      author: { select: { id: true, name: true, email: true } },
      photos: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!log) notFound();

  return (
    <DailyLogDetailView
      log={log}
      backHref="/pm/daily-logs"
      projectHref={`/pm/projects/${log.project.id}`}
    />
  );
}
