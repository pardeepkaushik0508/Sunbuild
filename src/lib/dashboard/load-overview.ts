import {
  Priority,
  ProjectStatus,
  Role,
  ScheduleStatus,
  TaskStatus,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  buildProjectInsights,
  depositOpenStatuses,
} from "@/lib/insights";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { buildGanttTree, tasksToScheduleRows } from "@/lib/dashboard/gantt-tree";
import {
  loadCompanyOverviewStats,
  resolveOwnerCompanies,
  type CompanyOverviewStats,
} from "@/lib/dashboard/company-stats";
import {
  ACTIVE_PROJECT_STATUSES,
  PLANNING_PROJECT_STATUSES,
} from "@/lib/jobs/constants";
import { formatCurrency, fullName } from "@/lib/utils";
import type { AppSession } from "@/lib/session";
import { getAccessibleProjectIds } from "@/lib/session";
import type { InsightCard } from "@/components/dashboard/ai-insights";
import type { ClientInfoItem } from "@/components/dashboard/client-info-strip";
import type { HighPriorityItem } from "@/components/dashboard/high-priority-widget";
import type { TodoItem } from "@/components/dashboard/todo-widget";
import type { GanttTask } from "@/lib/schedule/gantt-status";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import { mergeExternalGoogleEvents } from "@/lib/google/merge-events";
import { getPublicConnection } from "@/lib/google/calendar";
import { getPublicMicrosoftConnection } from "@/lib/microsoft/todo";
import type { PublicMicrosoftTodoConnection } from "@/lib/microsoft/types";

export type OverviewJob = {
  id: string;
  name: string;
  progressPercent: number;
  href: string;
  status: ProjectStatus;
};

export type OverviewDashboardData = {
  company: {
    id: string;
    name: string;
    brand: string | null;
    slug: string | null;
    isActive: boolean;
  };
  companies: CompanyOverviewStats[];
  orgStats: {
    activeProjects: number;
    openTasks: number;
    teamMembers: number;
  };
  jobs: OverviewJob[];
  selectedProjectId: string | null;
  selectedProjectName: string | null;
  selectedCompanyId: string | null;
  /** @deprecated High Priority loads Microsoft To Do client-side; kept empty for type compat. */
  highPriority: HighPriorityItem[];
  todos: TodoItem[];
  calendarEvents: CalendarEvent[];
  googleCalendarConnected: boolean;
  googleReconnectRequired: boolean;
  microsoftTodoConnection: PublicMicrosoftTodoConnection;
  ganttTasks: GanttTask[];
  progressPercent: number;
  clientItems: ClientInfoItem[];
  clientViewAllHref: string;
  insights: InsightCard[];
  insightsViewAllHref: string;
  projectsForTaskForm: Array<{ id: string; name: string }>;
  assigneesForTaskForm: Array<{ id: string; name: string }>;
  basePath: string;
  jobsViewAllHref: string;
  todoViewAllHref: string;
  highPriorityViewAllHref: string;
  addScheduleHref: string;
  taskDetailBaseHref: string;
  showOwnerChrome: boolean;
};

const ACTIVE_STATUSES: ProjectStatus[] = [
  ...ACTIVE_PROJECT_STATUSES,
  ...PLANNING_PROJECT_STATUSES,
];

export async function loadOverviewDashboardData(input: {
  session: AppSession;
  selectedProjectId?: string | null;
  selectedCompanyId?: string | null;
  basePath: "/owner" | "/pm";
}): Promise<OverviewDashboardData> {
  const { session, basePath } = input;
  const showOwnerChrome = basePath === "/owner";

  const ownerCompanies = showOwnerChrome
    ? resolveOwnerCompanies(session)
    : [{ id: session.membership.companyId, name: session.membership.companyName }];

  const requestedCompanyId = input.selectedCompanyId ?? null;
  const selectedCompanyId =
    (requestedCompanyId &&
      ownerCompanies.some((c) => c.id === requestedCompanyId) &&
      requestedCompanyId) ||
    session.membership.companyId;

  const companyIdsForStats = showOwnerChrome
    ? ownerCompanies.map((c) => c.id)
    : [session.membership.companyId];

  // Scope project access to selected company for Owner when companyId is set;
  // otherwise use session-accessible projects (single-company membership).
  let projectIds = await getAccessibleProjectIds(session);
  if (showOwnerChrome) {
    const scoped = await prisma.project.findMany({
      where: {
        companyId: {
          in: requestedCompanyId ? [selectedCompanyId] : companyIdsForStats,
        },
      },
      select: { id: true },
    });
    projectIds = scoped.map((p) => p.id);
  }

  const companyId = selectedCompanyId;

  const [
    company,
    companies,
    projects,
    _unusedHighPriorityLegacy,
    tasks,
    scheduleAll,
    delayedCount,
    deposits,
    depositSum,
    pendingDocs,
    overdueTasks,
    openRfis,
    assignees,
    orgActive,
    orgOpenTasks,
    orgTeam,
  ] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        brand: true,
        slug: true,
        isActive: true,
        description: true,
      },
    }),
    showOwnerChrome
      ? loadCompanyOverviewStats(companyIdsForStats)
      : Promise.resolve([] as CompanyOverviewStats[]),
    prisma.project.findMany({
      where: {
        id: { in: projectIds },
        status: { in: ACTIVE_STATUSES },
      },
      orderBy: { updatedAt: "desc" },
      take: 8,
      include: {
        milestones: { select: { status: true } },
        scheduleItems: { select: { status: true } },
        tasks: { select: { status: true } },
        buyer: true,
        deposits: {
          where: { status: { in: depositOpenStatuses() } },
          orderBy: { dueDate: "asc" },
          take: 3,
        },
        contracts: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, purchasePrice: true },
        },
        pm: { select: { name: true } },
      },
    }),
    // High Priority is loaded from Microsoft To Do (client/API), not local tasks.
    Promise.resolve([] as Array<{
      id: string;
      title: string;
      description: string | null;
      dueDate: Date | null;
      priority: Priority;
      assignee: { name: string } | null;
      project: { id: string; name: string };
    }>),
    prisma.task.findMany({
      where: {
        projectId: { in: projectIds },
        status: { not: TaskStatus.CANCELLED },
      },
      include: {
        assignee: { select: { name: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
      take: 120,
    }),
    prisma.scheduleItem.findMany({
      where: { projectId: { in: projectIds } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { startDate: "asc" },
      take: 80,
    }),
    prisma.scheduleItem.count({
      where: {
        projectId: { in: projectIds },
        status: ScheduleStatus.DELAYED,
      },
    }),
    prisma.deposit.findMany({
      where: {
        projectId: { in: projectIds },
        status: { in: depositOpenStatuses() },
      },
      orderBy: { dueDate: "asc" },
      take: 1,
      select: { id: true, amount: true, label: true, dueDate: true, status: true },
    }),
    prisma.deposit.aggregate({
      where: {
        projectId: { in: projectIds },
        status: { in: depositOpenStatuses() },
      },
      _sum: { amount: true },
    }),
    prisma.document.count({
      where: { projectId: { in: projectIds } },
    }),
    prisma.task.count({
      where: {
        projectId: { in: projectIds },
        dueDate: { lt: new Date(new Date().setHours(0, 0, 0, 0)) },
        status: { notIn: [TaskStatus.DONE, TaskStatus.CANCELLED] },
      },
    }),
    prisma.rFI.count({
      where: {
        projectId: { in: projectIds },
        status: { in: ["OPEN", "IN_PROGRESS"] },
      },
    }),
    prisma.membership.findMany({
      where: {
        companyId: { in: companyIdsForStats },
        isActive: true,
        role: Role.SUBCONTRACTOR,
      },
      include: { user: { select: { id: true, name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    prisma.project.count({
      where: {
        id: { in: projectIds },
        status: { in: ACTIVE_STATUSES },
      },
    }),
    prisma.task.count({
      where: {
        projectId: { in: projectIds },
        status: {
          in: [TaskStatus.TODO, TaskStatus.IN_PROGRESS, TaskStatus.BLOCKED],
        },
      },
    }),
    prisma.membership.count({
      where: {
        companyId: { in: companyIdsForStats },
        isActive: true,
      },
    }),
  ]);

  const jobs: OverviewJob[] = projects.slice(0, 4).map((p) => ({
    id: p.id,
    name: p.name,
    progressPercent: computeProjectProgress({
      progressPercent: p.progressPercent,
      scheduleItems: p.scheduleItems,
      milestones: p.milestones,
      tasks: p.tasks,
    }),
    href: `/pm/projects/${p.id}`,
    status: p.status,
  }));

  const requestedId = input.selectedProjectId ?? null;
  const selected =
    (requestedId && projects.find((p) => p.id === requestedId)) ||
    projects[0] ||
    null;

  const selectedId = selected?.id ?? null;

  const scheduleForGantt = scheduleAll.filter((s) =>
    selectedId ? s.projectId === selectedId : true
  );
  const tasksForGantt = tasks.filter((t) =>
    selectedId ? t.projectId === selectedId : true
  );

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
      href: `/pm/schedule?projectId=${item.projectId}`,
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
  ]);

  const todoTasks = tasks.filter(
    (t) =>
      t.status === TaskStatus.TODO ||
      t.status === TaskStatus.IN_PROGRESS ||
      t.status === TaskStatus.BLOCKED
  );

  const progressPercent = selected
    ? computeProjectProgress({
        progressPercent: selected.progressPercent,
        scheduleItems: selected.scheduleItems,
        milestones: selected.milestones,
        tasks: selected.tasks,
      })
    : 0;

  const clientItems = buildClientItems(selected, basePath);
  const clientViewAllHref = selected
    ? `/pm/projects/${selected.id}`
    : "/pm/projects";

  const nextDeposit = deposits[0];
  const nextDepositDue = nextDeposit?.dueDate
    ? formatRelativeDue(nextDeposit.dueDate)
    : null;

  const insights = buildProjectInsights({
    delayedScheduleCount: delayedCount,
    expectedDepositAmount: depositSum._sum.amount ?? 0,
    pendingDocCount: Math.min(pendingDocs, 12),
    overdueTaskCount: overdueTasks,
    openRfiCount: openRfis,
  }).map((insight) => {
    if (insight.id === "quality-risk") {
      return {
        ...insight,
        href: selectedId ? `/pm/projects/${selectedId}` : "/pm/schedule",
        meta: delayedCount > 0 ? `Confidence: ${Math.min(95, 70 + delayedCount * 5)}%` : undefined,
      };
    }
    if (insight.id === "deposits") {
      return {
        ...insight,
        href: "/bookkeeper/invoices",
        meta: nextDepositDue ? `Next Due: ${nextDepositDue}` : undefined,
      };
    }
    if (insight.id === "documents") {
      return {
        ...insight,
        href: "/pm/documents",
        meta: `Due: ${new Intl.DateTimeFormat("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }).format(new Date(Date.now() + 7 * 86400000))}`,
      };
    }
    return insight;
  });

  const localCalendarEvents = buildCalendarEvents({
    tasks,
    schedule: scheduleAll,
  });

  const [mergedCalendar, googleConnection, microsoftTodoConnection] =
    await Promise.all([
      mergeExternalGoogleEvents({
        session,
        localEvents: localCalendarEvents,
      }),
      getPublicConnection(session.user.id, session.membership.companyId),
      getPublicMicrosoftConnection(session.user.id, session.membership.companyId),
    ]);

  const mapTask = (
    t: (typeof tasks)[number]
  ): HighPriorityItem & TodoItem => ({
    id: t.id,
    title: t.title,
    description: t.description,
    dueDate: t.dueDate,
    priority: t.priority,
    projectName: t.project.name,
    projectId: t.project.id,
    assigneeName: t.assignee?.name,
    href: `/pm/tasks?projectId=${t.project.id}`,
    source: "SUNBUILD_TASK",
  });

  void _unusedHighPriorityLegacy;

  return {
    company: {
      id: company?.id ?? companyId,
      name: company?.name ?? "Organization",
      brand: company?.brand ?? null,
      slug: company?.slug ?? null,
      isActive: company?.isActive ?? true,
    },
    companies,
    orgStats: {
      activeProjects: orgActive,
      openTasks: orgOpenTasks,
      teamMembers: orgTeam,
    },
    jobs,
    selectedProjectId: selectedId,
    selectedProjectName: selected?.name ?? null,
    selectedCompanyId,
    highPriority: [],
    todos: todoTasks.map(mapTask),
    calendarEvents: mergedCalendar.events,
    googleCalendarConnected: googleConnection.connected,
    googleReconnectRequired:
      googleConnection.status === "RECONNECT_REQUIRED" ||
      mergedCalendar.googleReconnectRequired,
    microsoftTodoConnection,
    ganttTasks,
    progressPercent,
    clientItems,
    clientViewAllHref,
    insights,
    insightsViewAllHref:
      basePath === "/owner" ? "/owner/alerts" : "/pm/schedule",
    projectsForTaskForm: projects.map((p) => ({ id: p.id, name: p.name })),
    assigneesForTaskForm: uniqueAssignees(assignees),
    basePath,
    jobsViewAllHref: basePath === "/owner" ? "/owner/jobs" : "/pm/projects",
    todoViewAllHref: "/pm/tasks",
    highPriorityViewAllHref: "/owner/high-priority",
    addScheduleHref: "/pm/schedule#add-schedule",
    taskDetailBaseHref: "/pm/tasks",
    showOwnerChrome,
  };
}

function uniqueAssignees(
  memberships: Array<{ user: { id: string; name: string } }>
) {
  const seen = new Set<string>();
  const out: Array<{ id: string; name: string }> = [];
  for (const m of memberships) {
    if (seen.has(m.user.id)) continue;
    seen.add(m.user.id);
    out.push({ id: m.user.id, name: m.user.name });
  }
  return out;
}

function formatRelativeDue(date: Date) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - start.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff > 1 && diff < 7) return `In ${diff} days`;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function buildClientItems(
  project:
    | {
        id: string;
        name: string;
        status: ProjectStatus;
        purchasePrice: number | null;
        targetClosing: Date | null;
        buyer: {
          firstName: string;
          lastName: string;
          email: string | null;
          phone: string | null;
        } | null;
        deposits: Array<{ label: string; amount: number; status: string }>;
        contracts: Array<{ status: string; purchasePrice: number | null }>;
        pm: { name: string } | null;
      }
    | null,
  _basePath: string
): ClientInfoItem[] {
  if (!project) return [];

  const deposit = project.deposits[0];
  const contract = project.contracts[0];
  const clientName = project.buyer
    ? fullName(project.buyer.firstName, project.buyer.lastName)
    : null;

  return [
    {
      id: "deposit",
      label: deposit?.label || "Sales Deposit",
      value: deposit
        ? `${formatCurrency(deposit.amount)} · ${deposit.status}`
        : "No open deposits",
      href: "/bookkeeper/invoices",
    },
    {
      id: "client",
      label: "Client Name",
      value: clientName ?? "Unassigned",
      href: `/pm/projects/${project.id}`,
    },
    {
      id: "procurement",
      label: "Procurement",
      value: project.status.replace(/_/g, " "),
      href: `/pm/projects/${project.id}`,
    },
    {
      id: "project",
      label: "Project",
      value: project.name,
      href: `/pm/projects/${project.id}`,
    },
    {
      id: "contract",
      label: "Contract",
      value: contract
        ? contract.status.replace(/_/g, " ")
        : formatCurrency(project.purchasePrice) !== "—"
          ? formatCurrency(project.purchasePrice)
          : "No contract",
      href: "/pm/contracts",
    },
    {
      id: "closing",
      label: "Closing / PM",
      value: project.targetClosing
        ? new Intl.DateTimeFormat("en-CA", {
            month: "short",
            day: "numeric",
            year: "numeric",
          }).format(project.targetClosing)
        : project.pm?.name ?? "TBD",
      href: `/pm/projects/${project.id}`,
    },
  ];
}

function buildCalendarEvents(input: {
  tasks: Array<{
    id: string;
    title: string;
    dueDate: Date | null;
    project: { name: string };
  }>;
  schedule: Array<{
    id: string;
    title: string;
    startDate: Date;
    endDate: Date;
    project: { name: string };
  }>;
}): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const t of input.tasks) {
    if (!t.dueDate) continue;
    events.push({
      id: `task-${t.id}`,
      date: t.dueDate.toISOString(),
      title: t.title,
      type: "task",
      meta: t.project.name,
    });
  }

  for (const s of input.schedule) {
    events.push({
      id: `sched-start-${s.id}`,
      date: s.startDate.toISOString(),
      title: s.title,
      type: "schedule",
      meta: s.project.name,
    });
    if (s.endDate.getTime() !== s.startDate.getTime()) {
      events.push({
        id: `sched-end-${s.id}`,
        date: s.endDate.toISOString(),
        title: `${s.title} (end)`,
        type: "schedule",
        meta: s.project.name,
      });
    }
  }

  return events;
}
