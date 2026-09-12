import Link from "next/link";
import { Role, TaskStatus } from "@prisma/client";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { RecentJobsWidget } from "@/components/dashboard/recent-jobs-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { MetricBarChart } from "@/components/dashboard/charts-lazy";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { loadProgressByProjectIds } from "@/lib/dashboard/sync-project-progress";

export default async function SubDashboardPage() {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const projectIds = await getAccessibleProjectIds(session);

  const [projects, tasks, rfis] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, progressPercent: true },
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        assigneeId: session.user.id,
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
      include: { project: { select: { name: true } } },
      orderBy: { dueDate: "asc" },
      take: 12,
    }),
    prisma.rFI.count({
      where: {
        projectId: { in: projectIds },
        assigneeId: session.user.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
  ]);

  const progressById = await loadProgressByProjectIds(projects.map((p) => p.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subcontractor Portal"
        description="Assigned jobs, tasks and RFIs only"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <MetricCard label="Assigned jobs" value={projects.length} accent="green" />
        <MetricCard label="Open tasks" value={tasks.length} accent="orange" />
        <MetricCard label="Open RFIs" value={rfis} accent="blue" />
      </div>

      <MetricBarChart
        title="My workload"
        data={[
          { name: "Jobs", value: projects.length },
          { name: "Tasks", value: tasks.length },
          { name: "RFIs", value: rfis },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentJobsWidget
          jobs={projects.slice(0, 4).map((p) => ({
            id: p.id,
            name: p.name,
            progressPercent: progressById.get(p.id) ?? p.progressPercent,
            href: `/sub/jobs/${p.id}`,
          }))}
        />
        <TodoWidget
          viewAllHref="/sub"
          items={tasks.map((t) => ({
            id: t.id,
            title: t.title,
            description: t.project.name,
            dueDate: t.dueDate,
            priority: t.priority,
            href: `/sub/jobs/${t.projectId}`,
          }))}
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/sub/jobs/${p.id}`}
            className="rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-3 text-sm font-medium shadow-sm hover:border-[#fdba74]"
          >
            Open {p.name} →
          </Link>
        ))}
      </div>
    </div>
  );
}
