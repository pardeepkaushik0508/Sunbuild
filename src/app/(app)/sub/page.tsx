import {
  Briefcase,
  ListTodo,
  MessageSquareWarning,
  Timer,
  CheckCheck,
  AlertCircle,
} from "lucide-react";
import { Role, TaskStatus } from "@prisma/client";
import { PageHeader } from "@/components/ui/card";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { RecentJobsCard } from "@/components/dashboard/recent-jobs-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import {
  DashboardCalendarSlot,
  DashboardWidgetRow,
} from "@/components/dashboard/dashboard-widget-row";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { prisma } from "@/lib/db";
import { loadProgressByProjectIds } from "@/lib/dashboard/sync-project-progress";
import { buildGanttTree, tasksToScheduleRows } from "@/lib/dashboard/gantt-tree";
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
  ]);

  const progressById = await loadProgressByProjectIds(projects.map((p) => p.id));

  const localEvents: CalendarEvent[] = tasks
    .filter((t) => t.dueDate)
    .map((t) => ({
      id: `task-${t.id}`,
      date: t.dueDate!.toISOString(),
      title: t.title,
      type: "task" as const,
      meta: t.project.name,
    }));

  const [merged, connection] = await Promise.all([
    mergeExternalGoogleEvents({ session, localEvents }),
    getPublicConnection(session.user.id, session.membership.companyId),
  ]);

  // Gantt: only this subcontractor's assigned tasks (not full project schedule).
  const ganttTasks = buildGanttTree(
    tasksToScheduleRows(
      tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        startDate: t.startDate,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        assigneeName: session.user.name ?? null,
        projectName: t.project.name,
        projectId: t.project.id,
      }))
    )
  ).map((t) => ({
    ...t,
    href:
      t.isPhase || t.status === "PHASE"
        ? null
        : t.projectName
          ? `/sub/jobs/${tasks.find((x) => x.title === t.title)?.projectId ?? projects[0]?.id ?? ""}`
          : "/sub",
  }));

  // Prefer stable job links from task ids embedded as task:id
  const ganttWithLinks = ganttTasks.map((t) => {
    const taskId = t.id.startsWith("task:") ? t.id.slice(5) : null;
    const match = taskId ? tasks.find((x) => x.id === taskId) : null;
    return {
      ...t,
      href:
        t.isPhase || t.status === "PHASE"
          ? null
          : match
            ? `/sub/jobs/${match.projectId}`
            : "/sub",
    };
  });

  const doneCount = completedTasks;
  const openCount = openTaskCount;
  const progressPercent =
    openCount + doneCount > 0
      ? Math.round((doneCount / (openCount + doneCount)) * 100)
      : 0;

  const metrics = [
    {
      label: "Assigned Jobs",
      value: projects.length,
      wrap: "bg-[#dcfce7] text-[#16a34a]",
      Icon: Briefcase,
    },
    {
      label: "Open Tasks",
      value: openTaskCount,
      wrap: "bg-[#ffedd5] text-[#ea580c]",
      Icon: ListTodo,
    },
    {
      label: "Open RFIs",
      value: rfis,
      wrap: "bg-[#dbeafe] text-[#2563eb]",
      Icon: MessageSquareWarning,
    },
    {
      label: "Deadline Today",
      value: deadlineToday,
      wrap: "bg-[#fee2e2] text-[#dc2626]",
      Icon: Timer,
    },
    {
      label: "Completed",
      value: completedTasks,
      wrap: "bg-[#ede9fe] text-[#7c3aed]",
      Icon: CheckCheck,
    },
    {
      label: "Overdue",
      value: overdueTasks,
      wrap: "bg-[#e0e7ff] text-[#4338ca]",
      Icon: AlertCircle,
    },
  ];

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Subcontractor Portal"
        description="Assigned jobs, tasks and RFIs only"
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <OverviewMetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            icon={m.Icon}
            wrap={m.wrap}
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

      <GanttChart
        className="w-full"
        tasks={ganttWithLinks}
        progressPercent={progressPercent}
        projectLabel="My tasks"
      />
    </div>
  );
}
