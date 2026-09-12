import {
  ChangeOrderStatus,
  Priority,
  ProjectStatus,
  RfiStatus,
  ScheduleStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import type { AppSession } from "@/lib/session";
import { getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { fullName, formatCurrency } from "@/lib/utils";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { TodoItem } from "@/components/dashboard/todo-widget";
import type { InsightCard } from "@/components/dashboard/ai-insights";
import type { ClientInfoItem } from "@/components/dashboard/client-info-strip";
import { buildGanttTree } from "@/lib/dashboard/gantt-tree";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { mergeExternalGoogleEvents } from "@/lib/google/merge-events";
import { getPublicConnection } from "@/lib/google/calendar";

export type PmOverviewStat = {
  id: string;
  label: string;
  value: string | number;
  accent: "blue" | "green" | "purple" | "orange" | "red" | "indigo";
};

export async function loadPmOverviewData(
  session: AppSession,
  searchProjectId?: string | null
) {
  const accessibleIds = await getAccessibleProjectIds(session);
  const selectedId = await getSelectedProjectId(session, searchProjectId);
  const scopeIds =
    selectedId && accessibleIds.includes(selectedId)
      ? [selectedId]
      : accessibleIds;

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const [
    activeTodos,
    pendingRfis,
    todaysTasks,
    completedTasks,
    milestones,
    teamMembers,
    projects,
    tasks,
    scheduleItems,
    milestonesRows,
    assignees,
    selectedProject,
    overdue,
    pendingCos,
    activeProjectCount,
  ] = await Promise.all([
    prisma.task.count({
      where: {
        projectId: { in: scopeIds },
        status: { in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS] },
      },
    }),
    prisma.rFI.count({
      where: {
        projectId: { in: scopeIds },
        status: { in: [RfiStatus.OPEN, RfiStatus.IN_PROGRESS] },
      },
    }),
    prisma.task.count({
      where: {
        projectId: { in: scopeIds },
        dueDate: { gte: startOfToday, lt: endOfToday },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
    }),
    prisma.task.count({
      where: {
        projectId: { in: scopeIds },
        status: TaskStatus.DONE,
      },
    }),
    prisma.milestone.count({
      where: {
        projectId: { in: scopeIds },
        status: { not: ScheduleStatus.COMPLETED },
      },
    }),
    prisma.projectAccess.count({
      where: { projectId: { in: scopeIds } },
    }),
    prisma.project.findMany({
      where: { id: { in: accessibleIds } },
      orderBy: { updatedAt: "desc" },
      take: 12,
      include: {
        buyer: { select: { firstName: true, lastName: true } },
        milestones: { select: { status: true } },
      },
    }),
    prisma.task.findMany({
      where: {
        projectId: { in: scopeIds },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { name: true } },
      },
      orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      take: 40,
    }),
    prisma.scheduleItem.findMany({
      where: { projectId: { in: scopeIds } },
      orderBy: { startDate: "asc" },
      take: 80,
    }),
    prisma.milestone.findMany({
      where: { projectId: { in: scopeIds } },
      orderBy: { sortOrder: "asc" },
      take: 50,
    }),
    prisma.membership.findMany({
      where: {
        companyId: session.membership.companyId,
        isActive: true,
        role: {
          in: [
            "PROJECT_MANAGER",
            "OWNER",
            "OPERATIONS_ADMIN",
            "SUBCONTRACTOR",
          ],
        },
      },
      include: { user: { select: { id: true, name: true } } },
    }),
    selectedId
      ? prisma.project.findFirst({
          where: { id: selectedId },
          include: {
            buyer: true,
            pm: { select: { name: true } },
          },
        })
      : Promise.resolve(null),
    prisma.task.count({
      where: {
        projectId: { in: scopeIds },
        dueDate: { lt: startOfToday },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
    }),
    prisma.changeOrder.count({
      where: {
        projectId: { in: scopeIds },
        status: ChangeOrderStatus.PENDING_CLIENT,
      },
    }),
    prisma.project.count({
      where: {
        id: { in: accessibleIds },
        status: {
          in: [
            ProjectStatus.PRE_CONSTRUCTION,
            ProjectStatus.IN_PROGRESS,
            ProjectStatus.SUBSTANTIAL_COMPLETION,
            ProjectStatus.PENDING_CEO_APPROVAL,
          ],
        },
      },
    }),
  ]);

  const stats: PmOverviewStat[] = [
    { id: "todos", label: "Active To-Dos", value: activeTodos, accent: "orange" },
    { id: "rfis", label: "Pending RFIs", value: pendingRfis, accent: "red" },
    { id: "today", label: "Today's Tasks", value: todaysTasks, accent: "blue" },
    { id: "done", label: "Completed", value: completedTasks, accent: "green" },
    { id: "milestones", label: "Milestones", value: milestones, accent: "purple" },
    { id: "team", label: "Team Members", value: teamMembers, accent: "indigo" },
  ];

  const todos: TodoItem[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    priority: t.priority,
    projectName: t.project.name,
    projectId: t.project.id,
    assigneeName: t.assignee?.name,
    href: `/pm/tasks?projectId=${t.projectId}`,
  }));

  const localCalendarEvents: CalendarEvent[] = [
    ...tasks
      .filter((t) => t.dueDate)
      .map((t) => ({
        id: `task-${t.id}`,
        date: (t.dueDate as Date).toISOString(),
        title: t.title,
        type: "task" as const,
        meta: t.project.name,
      })),
    ...scheduleItems.map((s) => ({
      id: `sched-${s.id}`,
      date: s.startDate.toISOString(),
      title: s.title,
      type: "schedule" as const,
      meta: s.trade || undefined,
      googleEventId: s.googleEventId ?? undefined,
    })),
    ...milestonesRows
      .filter((m) => m.dueDate)
      .map((m) => ({
        id: `ms-${m.id}`,
        date: (m.dueDate as Date).toISOString(),
        title: m.title,
        type: "milestone" as const,
      })),
  ];

  const [mergedCalendar, googleConnection] = await Promise.all([
    mergeExternalGoogleEvents({
      session,
      localEvents: localCalendarEvents,
    }),
    getPublicConnection(session.user.id, session.membership.companyId),
  ]);
  const calendarEvents = mergedCalendar.events;

  const ganttTasks = buildGanttTree(
    scheduleItems.map((s) => ({
      id: s.id,
      title: s.title,
      trade: s.trade,
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
      dependsOnId: s.dependsOnId,
      assigneeName: s.assigneeName,
      projectName: selectedProject?.name ?? null,
    }))
  );
  const progressPercent = selectedProject
    ? computeProjectProgress({
        progressPercent: selectedProject.progressPercent,
        milestones: milestonesRows.filter(
          (m) => m.projectId === selectedProject.id
        ),
        scheduleItems: scheduleItems.filter(
          (s) => s.projectId === selectedProject.id
        ),
      })
    : 0;

  const clientItems: ClientInfoItem[] = selectedProject
    ? [
        {
          id: "client",
          label: "Client",
          value: selectedProject.buyer
            ? fullName(
                selectedProject.buyer.firstName,
                selectedProject.buyer.lastName
              )
            : "—",
          href: `/pm/projects/${selectedProject.id}`,
        },
        {
          id: "status",
          label: "Status",
          value: selectedProject.status.replace(/_/g, " "),
          href: `/pm/projects/${selectedProject.id}`,
        },
        {
          id: "address",
          label: "Address",
          value: selectedProject.municipalAddress || "—",
        },
        {
          id: "pm",
          label: "PM",
          value: selectedProject.pm?.name || "—",
        },
        {
          id: "price",
          label: "Purchase Price",
          value: formatCurrency(selectedProject.purchasePrice),
        },
        {
          id: "closing",
          label: "Target Closing",
          value: selectedProject.targetClosing
            ? selectedProject.targetClosing.toLocaleDateString("en-CA")
            : "—",
        },
      ]
    : [];

  const insights: InsightCard[] = [];
  if (pendingRfis > 0) {
    insights.push({
      id: "rfis",
      category: "RFIs",
      severity: "HIGH",
      message: `${pendingRfis} RFI${pendingRfis === 1 ? "" : "s"} awaiting response.`,
      href: selectedId ? `/pm/rfis?projectId=${selectedId}` : "/pm/rfis",
      actionLabel: "View Details",
    });
  }
  if (todaysTasks > 0) {
    insights.push({
      id: "today-tasks",
      category: "Schedule",
      severity: "MEDIUM",
      message: `${todaysTasks} task${todaysTasks === 1 ? "" : "s"} due today.`,
      href: selectedId ? `/pm/tasks?projectId=${selectedId}` : "/pm/tasks",
      actionLabel: "Review",
    });
  }
  if (overdue > 0) {
    insights.push({
      id: "overdue",
      category: "Tasks",
      severity: "HIGH",
      message: `${overdue} overdue task${overdue === 1 ? "" : "s"} need attention.`,
      href: selectedId ? `/pm/tasks?projectId=${selectedId}` : "/pm/tasks",
      actionLabel: "Process",
    });
  }

  if (pendingCos > 0 && insights.length < 3) {
    insights.push({
      id: "cos",
      category: "Change Orders",
      severity: "NEW",
      message: `${pendingCos} change order${pendingCos === 1 ? "" : "s"} pending client approval.`,
      href: selectedId
        ? `/pm/change-orders?projectId=${selectedId}`
        : "/pm/change-orders",
      actionLabel: "Review",
    });
  }

  return {
    stats,
    selectedId,
    selectedProject,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      municipalAddress: p.municipalAddress,
      buyerName: p.buyer
        ? fullName(p.buyer.firstName, p.buyer.lastName)
        : null,
      progressPercent: p.progressPercent,
      milestonesDone: p.milestones.filter(
        (m) => m.status === ScheduleStatus.COMPLETED
      ).length,
      milestonesTotal: p.milestones.length,
    })),
    todos,
    calendarEvents,
    googleCalendarConnected: googleConnection.connected,
    googleReconnectRequired:
      googleConnection.status === "RECONNECT_REQUIRED" ||
      mergedCalendar.googleReconnectRequired,
    ganttTasks,
    progressPercent,
    clientItems,
    insights: insights.slice(0, 3),
    projectsForTaskForm: projects.map((p) => ({ id: p.id, name: p.name })),
    assigneesForTaskForm: assignees.map((m) => ({
      id: m.user.id,
      name: m.user.name,
    })),
    activeProjectCount,
  };
}
