import { notFound } from "next/navigation";
import { Role } from "@prisma/client";
import { DailyLogDetailView } from "@/components/daily-logs/daily-log-detail-view";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SubDailyLogDetailPage({ params }: PageProps) {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const { id } = await params;
  const projectIds = await getAccessibleProjectIds(session);

  const log = await prisma.dailyLog.findFirst({
    where: {
      id,
      authorId: session.user.id,
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
      backHref="/sub/daily-logs"
      backLabel="My daily logs"
      projectHref={`/sub/jobs/${log.project.id}`}
    />
  );
}
