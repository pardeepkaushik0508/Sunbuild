import Link from "next/link";
import {
  CompletionDocStatus,
  Priority,
  ProjectStatus,
  Role,
  TaskStatus,
} from "@prisma/client";
import {
  ClipboardCheck,
  FolderKanban,
  MessageSquareWarning,
  Briefcase,
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
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { TodoItem } from "@/components/dashboard/todo-widget";

export default async function CeoOverviewPage() {
  const session = await requireRole([Role.CEO, Role.OWNER]);
  const companyId = session.membership.companyId;

  const companyProjects = await prisma.project.findMany({
    where: { companyId },
    select: { id: true },
  });
  const projectIdList = companyProjects.map((p) => p.id);

  const [
    active,
    pendingApprovals,
    projects,
    openRfis,
    scheduleItems,
    milestones,
    openTasks,
    approvalDocs,
  ] = await Promise.all([
    prisma.project.count({
      where: {
        companyId,
        status: {
          in: [
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.PRE_CONSTRUCTION,
            ProjectStatus.SUBSTANTIAL_COMPLETION,
            ProjectStatus.PENDING_CEO_APPROVAL,
            ProjectStatus.COMPLETED,
            ProjectStatus.HANDED_OVER,
          ],
        },
      },
    }),
    prisma.completionDocument.count({
      where: {
        status: CompletionDocStatus.PENDING_CEO_APPROVAL,
        projectId: { in: projectIdList },
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
    prisma.rFI.count({
      where: {
        project: { companyId },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.scheduleItem.findMany({
      where: { projectId: { in: projectIdList } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
      take: 120,
    }),
    prisma.milestone.findMany({
      where: {
        projectId: { in: projectIdList },
        dueDate: { not: null },
      },
      include: { project: { select: { name: true } } },
      take: 50,
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
    prisma.completionDocument.findMany({
      where: {
        status: CompletionDocStatus.PENDING_CEO_APPROVAL,
        projectId: { in: projectIdList },
      },
      take: 12,
    }),
  ]);

  const progressById = await loadProgressByProjectIds(projects.map((p) => p.id));
  const approvalProjectIds = approvalDocs.map((d) => d.projectId);
  const approvalProjects =
    approvalProjectIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: approvalProjectIds } },
          select: { id: true, name: true },
        })
      : [];
  const approvalProjectById = new Map(
    approvalProjects.map((p) => [p.id, p])
  );
  const today = new Date();
  today.setHours(12, 0, 0, 0);

  const todos: TodoItem[] = [
    ...approvalDocs.map((doc) => ({
      id: `approval-${doc.id}`,
      title: `Approve completion — ${
        approvalProjectById.get(doc.projectId)?.name ?? "Project"
      }`,
      description: "Pending CEO approval",
      dueDate: today,
      priority: Priority.HIGH,
      projectName: approvalProjectById.get(doc.projectId)?.name,
      href: "/ceo/approvals",
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
    ...milestones.map((m) => ({
      id: `ms-${m.id}`,
      date: m.dueDate!.toISOString(),
      title: m.title,
      type: "milestone" as const,
      meta: m.project.name,
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

  const focusProject = projects[0] ?? null;
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
        progressPercent: progressById.get(focusProject.id) ?? focusProject.progressPercent,
        status: focusProject.status,
        milestones: focusProject.milestones,
        scheduleItems: focusProject.scheduleItems,
        tasks: focusProject.tasks,
      })
    : 0;

  const metrics = [
    {
      label: "Active Projects",
      value: active,
      wrap: "bg-[#dcfce7] text-[#16a34a]",
      Icon: FolderKanban,
      href: "/pm/projects",
    },
    {
      label: "Pending Approvals",
      value: pendingApprovals,
      wrap: "bg-[#ffedd5] text-[#ea580c]",
      Icon: ClipboardCheck,
      href: "/ceo/approvals",
    },
    {
      label: "Open RFIs",
      value: openRfis,
      wrap: "bg-[#dbeafe] text-[#2563eb]",
      Icon: MessageSquareWarning,
      href: "/pm/rfis",
    },
    {
      label: "Jobs Tracked",
      value: projects.length,
      wrap: "bg-[#ede9fe] text-[#7c3aed]",
      Icon: Briefcase,
      href: "/pm/projects",
    },
  ];

  return (
    <div className="w-full space-y-5">
      <PageHeader
        title="CEO Overview"
        description="Operational visibility across Sunview Homes"
        actions={
          <Link href="/ceo/approvals">
            <Button>Completion Approvals</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
          title="Recent Jobs"
          subtitle="Track project progress"
        />
        <TodoWidget items={todos} viewAllHref="/ceo/approvals" />
        <DashboardCalendarSlot>
          <CalendarWidget
            events={merged.events}
            googleConnected={connection.connected}
            googleReconnectRequired={
              connection.status === "RECONNECT_REQUIRED" ||
              merged.googleReconnectRequired
            }
            connectReturnPath="/ceo"
            subtitle="Company schedule overview"
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

      <Card>
        <h3 className="mb-3 text-[16px] font-semibold">Quick actions</h3>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/ceo/approvals"
            className="rounded-xl border border-sb-border px-4 py-2.5 text-sm font-medium transition hover:border-sb-orange/40"
          >
            Review completion documents →
          </Link>
          <Link
            href="/pm/projects"
            className="rounded-xl border border-sb-border px-4 py-2.5 text-sm font-medium transition hover:border-sb-orange/40"
          >
            Browse all jobs →
          </Link>
        </div>
      </Card>
    </div>
  );
}
