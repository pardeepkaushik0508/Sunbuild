import Link from "next/link";
import { Role, ProjectStatus } from "@prisma/client";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  ACTIVE_PROJECT_STATUSES,
  COMPLETED_PROJECT_STATUSES,
  PLANNING_PROJECT_STATUSES,
  UPCOMING_DEADLINE_DAYS,
} from "@/lib/jobs/constants";
import { projectStatusLabel } from "@/lib/jobs/status";
import { formatDate } from "@/lib/utils";
import { PageHeader, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export async function JobsReportsView({
  backHref,
  roles,
}: {
  backHref: string;
  roles: Role[];
}) {
  const session = await requireRole(roles);
  const projectIds = await getAccessibleProjectIds(session);
  const companyId = session.membership.companyId;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const deadlineEnd = new Date(
    Date.now() + UPCOMING_DEADLINE_DAYS * 86400000
  );

  const [byStatus, upcoming] = await Promise.all([
    prisma.project.groupBy({
      by: ["status"],
      where: { id: { in: projectIds }, companyId },
      _count: { _all: true },
    }),
    prisma.project.findMany({
      where: {
        id: { in: projectIds },
        companyId,
        targetClosing: { gte: now, lte: deadlineEnd },
        status: {
          notIn: [ProjectStatus.CANCELLED, ProjectStatus.HANDED_OVER],
        },
      },
      orderBy: { targetClosing: "asc" },
      take: 20,
      select: {
        id: true,
        name: true,
        status: true,
        targetClosing: true,
      },
    }),
  ]);

  const countFor = (statuses: ProjectStatus[]) =>
    byStatus
      .filter((r) => statuses.includes(r.status))
      .reduce((s, r) => s + r._count._all, 0);

  const summary = [
    { label: "Active", value: countFor(ACTIVE_PROJECT_STATUSES) },
    { label: "Planning", value: countFor(PLANNING_PROJECT_STATUSES) },
    { label: "Completed", value: countFor(COMPLETED_PROJECT_STATUSES) },
    { label: "Total", value: projectIds.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Jobs Reports"
        description="Basic operational report from live project records"
        actions={
          <Link href={backHref}>
            <Button variant="outline" size="sm">
              Back to Jobs
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summary.map((s) => (
          <Card key={s.label} className="p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-sb-muted">
              {s.label}
            </p>
            <p className="mt-2 text-2xl font-bold text-sb-ink">{s.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="text-[15px] font-semibold text-sb-ink">
          Upcoming deadlines ({UPCOMING_DEADLINE_DAYS} days)
        </h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-sb-muted">
            No project target closing dates fall in this window.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-sb-border">
            {upcoming.map((p) => (
              <li
                key={p.id}
                className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <Link
                  href={`/pm/projects/${p.id}`}
                  className="font-medium text-sb-ink hover:text-sb-orange"
                >
                  {p.name}
                </Link>
                <div className="flex items-center gap-3 text-sm text-sb-muted">
                  <span>{projectStatusLabel(p.status)}</span>
                  <span>{formatDate(p.targetClosing)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
