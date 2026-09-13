import { Role, TaskStatus } from "@prisma/client";
import { PageHeader, MetricCard } from "@/components/ui/card";
import { RecentJobsCard } from "@/components/dashboard/recent-jobs-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import {
  DashboardCalendarSlot,
  DashboardWidgetRow,
} from "@/components/dashboard/dashboard-widget-row";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { loadProgressByProjectIds } from "@/lib/dashboard/sync-project-progress";
import { mergeExternalGoogleEvents } from "@/lib/google/merge-events";
import { getPublicConnection } from "@/lib/google/calendar";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";

export default async function SubDashboardPage() {
  const session = await requireRole(Role.SUBCONTRACTOR);
  const projectIds = await getAccessibleProjectIds(session);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const openTaskWhere = {
    projectId: { in: projectIds },
    assigneeId: session.user.id,
    status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] as TaskStatus[] },
  };

  const [
    projects,
    tasks,
    openTaskCount,
    rfis,
    deadlineToday,
    completedTasks,
    overdueTasks,
    scheduleItems,
  ] = await Promise.all([
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, progressPercent: true },
    }),
    prisma.task.findMany({
      where: openTaskWhere,
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 40,
    }),
    prisma.task.count({ where: openTaskWhere }),
    prisma.rFI.count({
      where: {
        projectId: { in: projectIds },
        assigneeId: session.user.id,
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.task.count({
      where: {
        ...openTaskWhere,
        dueDate: { not: null, lt: endOfToday },
      },
    }),
    prisma.task.count({
      where: {
        projectId: { in: projectIds },
        assigneeId: session.user.id,
        status: TaskStatus.DONE,
      },
    }),
    prisma.task.count({
      where: {
        ...openTaskWhere,
        dueDate: { not: null, lt: startOfToday },
      },
    }),
    prisma.scheduleItem.findMany({
      where: { projectId: { in: projectIds } },
      include: { project: { select: { name: true } } },
      orderBy: { startDate: "asc" },
      take: 60,
    }),
  ]);

  const progressById = await loadProgressByProjectIds(projects.map((p) => p.id));

  const localEvents: CalendarEvent[] = [
    ...tasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: `task-${t.id}`,
        date: t.dueDate!.toISOString(),
        title: t.title,
        type: "task" as const,
        meta: t.project.name,
      })),
    ...scheduleItems.map((s) => ({
      id: `sched-${s.id}`,
      date: s.startDate.toISOString(),
      title: s.title,
      type: "schedule" as const,
      meta: s.project.name,
    })),
  ];

  const [merged, connection] = await Promise.all([
    mergeExternalGoogleEvents({ session, localEvents }),
    getPublicConnection(session.user.id, session.membership.companyId),
  ]);

  const stats = [
    { id: "jobs", label: "Assigned Jobs", value: projects.length, accent: "green" as const },
    { id: "tasks", label: "Open Tasks", value: openTaskCount, accent: "orange" as const },
    { id: "rfis", label: "Open RFIs", value: rfis, accent: "blue" as const },
    {
      id: "deadline",
      label: "Deadline Today",
      value: deadlineToday,
      accent: "red" as const,
    },
    {
      id: "done",
      label: "Completed",
      value: completedTasks,
      accent: "purple" as const,
    },
    {
      id: "overdue",
      label: "Overdue",
      value: overdueTasks,
      accent: "indigo" as const,
    },
  ];

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Subcontractor Portal"
        description="Assigned jobs, tasks and RFIs only"
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {stats.map((s) => (
          <MetricCard
            key={s.id}
            label={s.label}
            value={s.value}
            accent={s.accent}
          />
        ))}
      </div>

      <DashboardWidgetRow>
        <RecentJobsCard
          jobs={projects.slice(0, 4).map((p) => ({
            id: p.id,
            name: p.name,
            progressPercent: progressById.get(p.id) ?? p.progressPercent,
            href: `/sub/jobs/${p.id}`,
          }))}
          linkMode="href"
          viewAllHref="/sub"
          title="Recent Jobs"
          subtitle="Your assigned projects"
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
        <DashboardCalendarSlot>
          <CalendarWidget
            events={merged.events}
            subtitle="Your schedule overview"
            googleConnected={connection.connected}
            googleReconnectRequired={
              connection.status === "RECONNECT_REQUIRED" ||
              merged.googleReconnectRequired
            }
            connectReturnPath="/sub"
          />
        </DashboardCalendarSlot>
      </DashboardWidgetRow>
    </div>
  );
}
