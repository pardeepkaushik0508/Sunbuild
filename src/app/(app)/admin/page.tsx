import Link from "next/link";
import {
  Priority,
  ProjectStatus,
  Role,
  TaskStatus,
} from "@prisma/client";
import {
  Users,
  FolderKanban,
  FileText,
  ClipboardList,
  CheckCheck,
  Timer,
} from "lucide-react";
import { PageHeader, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { OverviewMetricCard } from "@/components/dashboard/overview-metric-card";
import { RecentJobsCard } from "@/components/dashboard/recent-jobs-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import {
  DashboardCalendarSlot,
  DashboardWidgetRow,
} from "@/components/dashboard/dashboard-widget-row";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/db";
import { mergeExternalGoogleEvents } from "@/lib/google/merge-events";
import { getPublicConnection } from "@/lib/google/auth-client";
import { loadProgressByProjectIds } from "@/lib/dashboard/sync-project-progress";
import { buildGanttTree, tasksToScheduleRows } from "@/lib/dashboard/gantt-tree";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { COMPLETED_PROJECT_STATUSES } from "@/lib/jobs/constants";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { TodoItem } from "@/components/dashboard/todo-widget";

export default async function AdminOverviewPage() {
  const session = await requireRole(Role.OPERATIONS_ADMIN);
  const companyId = session.membership.companyId;

  const companyProjects = await prisma.project.findMany({
    where: { companyId },
    select: { id: true },
  });
  const projectIdList = companyProjects.map((p) => p.id);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);

  const [
    users,
    projectsCount,
    contracts,
    pendingContracts,
    completedProjects,
    deadlineToday,
    projects,
    scheduleItems,
    openTasks,
    company,
  ] = await Promise.all([
    prisma.membership.count({ where: { companyId, isActive: true } }),
    prisma.project.count({ where: { companyId } }),
    prisma.purchaseContract.count({
      where: {
        OR: [
          { project: { companyId } },
          { uploadedBy: { memberships: { some: { companyId } } } },
        ],
      },
    }),
    prisma.purchaseContract.count({
      where: {
        status: { in: ["UPLOADED", "IN_REVIEW"] },
        OR: [
          { project: { companyId } },
          { uploadedBy: { memberships: { some: { companyId } } } },
        ],
      },
    }),
    prisma.project.count({
      where: {
        companyId,
        status: { in: COMPLETED_PROJECT_STATUSES },
      },
    }),
    prisma.task.count({
      where: {
        projectId: { in: projectIdList },
        dueDate: { not: null, lt: endOfToday },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
    }),
    prisma.project.findMany({
      where: { companyId },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        milestones: { select: { status: true } },
        scheduleItems: { select: { status: true } },
        tasks: { select: { status: true } },
      },
    }),
    prisma.scheduleItem.findMany({
      where: { projectId: { in: projectIdList } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
      take: 120,
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIdList },
        status: {
          in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
        },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
      take: 40,
    }),
    prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, brand: true },
    }),
  ]);

  const progressById = await loadProgressByProjectIds(projects.map((p) => p.id));
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const pendingContractRows = await prisma.purchaseContract.findMany({
    where: {
      status: { in: ["UPLOADED", "IN_REVIEW"] },
      OR: [
        { project: { companyId } },
        { uploadedBy: { memberships: { some: { companyId } } } },
      ],
    },
    select: {
      id: true,
      fileName: true,
      status: true,
      project: { select: { name: true } },
    },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });

  const todos: TodoItem[] = [
    ...pendingContractRows.map((c) => ({
      id: `contract-${c.id}`,
      title: c.fileName || "Contract in review",
      description: c.project?.name
        ? `${c.status.replace(/_/g, " ")} · ${c.project.name}`
        : c.status.replace(/_/g, " "),
      dueDate: today,
      priority: Priority.HIGH,
      projectName: c.project?.name,
      href: "/pm/contracts",
    })),
    ...openTasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.project.name,
      dueDate: t.dueDate,
      priority: t.priority,
      projectName: t.project.name,
      assigneeName: t.assignee?.name,
      href: `/pm/projects/${t.project.id}`,
    })),
  ];

  const localEvents: CalendarEvent[] = [
    ...scheduleItems.map((s) => ({
      id: `sched-${s.id}`,
      date: s.startDate.toISOString(),
      title: s.title,
      type: "schedule" as const,
      meta: s.trade || s.project.name,
      googleEventId: s.googleEventId ?? undefined,
    })),
    ...openTasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: `task-${t.id}`,
        date: t.dueDate!.toISOString(),
        title: t.title,
        type: "task" as const,
        meta: t.project.name,
      })),
  ];

  const [merged, connection] = await Promise.all([
    mergeExternalGoogleEvents({ session, localEvents }),
    getPublicConnection(session.user.id, companyId),
  ]);

  const focusStatuses: ProjectStatus[] = [
    ProjectStatus.IN_PROGRESS,
    ProjectStatus.PRE_CONSTRUCTION,
    ProjectStatus.SUBSTANTIAL_COMPLETION,
  ];
  const focusProject =
    projects.find((p) => focusStatuses.includes(p.status)) ??
    projects[0] ??
    null;

  const scheduleForGantt = focusProject
    ? scheduleItems.filter((s) => s.projectId === focusProject.id)
    : scheduleItems.slice(0, 40);
  const tasksForGantt = focusProject
    ? openTasks.filter((t) => t.projectId === focusProject.id)
    : openTasks.slice(0, 20);

  const ganttTasks = buildGanttTree([
    ...scheduleForGantt.map((item) => ({
      id: item.id,
      title: item.title,
      trade: item.trade,
      startDate: item.startDate,
      endDate: item.endDate,
      status: item.status,
      dependsOnId: item.dependsOnId,
      assigneeName: item.assigneeName,
      projectName: item.project.name,
      href: `/pm/projects/${item.projectId}`,
      baselineStartDate: item.baselineStartDate,
      baselineEndDate: item.baselineEndDate,
      actualStartDate: item.actualStartDate,
      actualEndDate: item.actualEndDate,
    })),
    ...tasksToScheduleRows(
      tasksForGantt.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        startDate: t.startDate,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        assigneeName: t.assignee?.name ?? null,
        projectName: t.project.name,
        projectId: t.project.id,
      }))
    ),
  ]).map((t) => ({
    ...t,
    href:
      t.isPhase || t.status === "PHASE"
        ? null
        : focusProject
          ? `/pm/projects/${focusProject.id}`
          : "/pm/schedule",
  }));

  const progressPercent = focusProject
    ? computeProjectProgress({
        progressPercent:
          progressById.get(focusProject.id) ?? focusProject.progressPercent,
        status: focusProject.status,
        milestones: focusProject.milestones,
        scheduleItems: focusProject.scheduleItems,
        tasks: focusProject.tasks,
      })
    : 0;

  const metrics = [
    {
      label: "Users",
      value: users,
      wrap: "bg-[#dbeafe] text-[#2563eb]",
      Icon: Users,
      href: "/owner/users",
    },
    {
      label: "Active Projects",
      value: projectsCount,
      wrap: "bg-[#dcfce7] text-[#16a34a]",
      Icon: FolderKanban,
      href: "/pm/projects",
    },
    {
      label: "Contracts",
      value: contracts,
      wrap: "bg-[#ede9fe] text-[#7c3aed]",
      Icon: FileText,
      href: "/pm/contracts",
    },
    {
      label: "In Review",
      value: pendingContracts,
      wrap: "bg-[#ffedd5] text-[#ea580c]",
      Icon: ClipboardList,
      href: "/pm/contracts",
    },
    {
      label: "Completed",
      value: completedProjects,
      wrap: "bg-[#ede9fe] text-[#7c3aed]",
      Icon: CheckCheck,
      href: "/pm/projects",
    },
    {
      label: "Deadline Today",
      value: deadlineToday,
      wrap: "bg-[#fee2e2] text-[#dc2626]",
      Icon: Timer,
      href: "/pm/tasks",
    },
  ];

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="Operations Admin"
        description={`${company?.name ?? "Company"} — operations, users and project access`}
        actions={
          <Link href="/owner/users">
            <Button variant="outline">User directory</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {metrics.map((m) => (
          <OverviewMetricCard
            key={m.label}
            label={m.label}
            value={m.value}
            icon={m.Icon}
            wrap={m.wrap}
            href={m.href}
          />
        ))}
      </div>

      <DashboardWidgetRow>
        <RecentJobsCard
          jobs={projects.slice(0, 4).map((p) => ({
            id: p.id,
            name: p.name,
            progressPercent:
              progressById.get(p.id) ??
              computeProjectProgress({
                progressPercent: p.progressPercent,
                status: p.status,
                milestones: p.milestones,
                scheduleItems: p.scheduleItems,
                tasks: p.tasks,
              }),
            href: `/pm/projects/${p.id}`,
          }))}
          linkMode="href"
          viewAllHref="/pm/projects"
          title="Recent Projects"
          subtitle="Company project progress"
        />
        <TodoWidget items={todos} viewAllHref="/pm/contracts" />
        <DashboardCalendarSlot>
          <CalendarWidget
            events={merged.events}
            googleConnected={connection.connected}
            googleReconnectRequired={
              connection.status === "RECONNECT_REQUIRED" ||
              merged.googleReconnectRequired
            }
            connectReturnPath="/admin"
            subtitle="Ops schedule overview"
          />
        </DashboardCalendarSlot>
      </DashboardWidgetRow>

      <GanttChart
        className="w-full"
        tasks={ganttTasks}
        progressPercent={progressPercent}
        projectLabel={focusProject?.name ?? "Company portfolio"}
        addHref="/pm/schedule"
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Contracts workspace</p>
            <p className="text-xs text-sb-muted">Upload and review</p>
          </div>
          <Link href="/pm/contracts">
            <Button size="sm">Open</Button>
          </Link>
        </Card>
        <Card className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Site content</p>
            <p className="text-xs text-sb-muted">Privacy &amp; Terms editor</p>
          </div>
          <Link href="/content">
            <Button size="sm" variant="outline">
              Edit
            </Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
