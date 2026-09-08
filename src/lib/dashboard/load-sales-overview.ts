import {
  LeadStatus,
  Priority,
  ProposalStatus,
  type Lead,
  type LeadActivity,
  type Proposal,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { formatCurrency, formatRelativeTime, fullName } from "@/lib/utils";
import type { CalendarEvent } from "@/components/dashboard/calendar-widget";
import type { TodoItem } from "@/components/dashboard/todo-widget";
import type { InsightCard } from "@/components/dashboard/ai-insights";
import type { ClientInfoItem } from "@/components/dashboard/client-info-strip";

export type SalesKpi = {
  id: string;
  label: string;
  value: string;
  growth: string | null;
  accent: "blue" | "purple" | "green" | "amber" | "slate" | "rose";
  icon: "home" | "file" | "rocket" | "bag" | "check" | "chart";
};

export type SalesActivityItem = {
  id: string;
  title: string;
  description: string;
  relativeTime: string;
  type: string;
  href: string;
};

export type PipelineStage = {
  key: string;
  label: string;
  count: number;
  href: string;
  statuses: LeadStatus[];
};

export type ActionLead = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  estimatedValue: number | null;
  source: string | null;
  assigneeName: string | null;
  nextAction: string | null;
  lastContactAt: Date | null;
  status: LeadStatus;
  statusLabel: string;
  href: string;
};

export type SalesOverviewData = {
  kpis: SalesKpi[];
  activities: SalesActivityItem[];
  todos: TodoItem[];
  calendarEvents: CalendarEvent[];
  pipeline: PipelineStage[];
  actionLeads: ActionLead[];
  clientItems: ClientInfoItem[];
  insights: InsightCard[];
  assignees: Array<{ id: string; name: string }>;
  leadsForForm: Array<{ id: string; name: string }>;
  sectionErrors: Partial<
    Record<
      | "kpis"
      | "activities"
      | "todos"
      | "calendar"
      | "pipeline"
      | "actionLeads"
      | "client"
      | "insights",
      string
    >
  >;
};

const PIPELINE_STAGES: Array<{
  key: string;
  label: string;
  statuses: LeadStatus[];
}> = [
  {
    key: "initial-contact",
    label: "Initial Contact",
    statuses: [LeadStatus.NEW, LeadStatus.CONTACTED],
  },
  {
    key: "qualification",
    label: "Qualification",
    statuses: [LeadStatus.QUALIFIED],
  },
  {
    key: "proposal",
    label: "Proposal",
    statuses: [LeadStatus.PROPOSAL],
  },
  {
    key: "negotiation",
    label: "Negotiation",
    statuses: [LeadStatus.NEGOTIATION],
  },
  {
    key: "closed-won",
    label: "Closed Won",
    statuses: [LeadStatus.WON],
  },
];

const ACTIVE_PROPOSAL_STATUSES: ProposalStatus[] = [
  ProposalStatus.DRAFT,
  ProposalStatus.SENT,
];

function compactCurrency(amount: number | null | undefined) {
  if (amount == null || Number.isNaN(amount)) return "—";
  if (Math.abs(amount) >= 1000) {
    const k = amount / 1000;
    const rounded = Math.abs(k) >= 100 ? Math.round(k) : Math.round(k * 10) / 10;
    return `$${rounded}K`;
  }
  return formatCurrency(amount);
}

function activityTitle(
  activity: Pick<LeadActivity, "title" | "type" | "content">,
  leadName: string
) {
  if (activity.title?.trim()) return activity.title.trim();
  switch (activity.type) {
    case "CALL":
      return `Follow-up call with ${leadName}`;
    case "PROPOSAL":
      return `Proposal update for ${leadName}`;
    case "MEETING":
    case "SITE_VISIT":
      return `Meeting with ${leadName}`;
    case "FOLLOW_UP":
      return `Follow-up: ${leadName}`;
    case "STATUS":
      return `Status updated — ${leadName}`;
    default:
      return `Note — ${leadName}`;
  }
}

async function safeSection<T>(
  key: keyof SalesOverviewData["sectionErrors"],
  sectionErrors: SalesOverviewData["sectionErrors"],
  fallback: T,
  fn: () => Promise<T>
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[sales-overview] ${key}`, err);
    sectionErrors[key] =
      err instanceof Error ? err.message : "Failed to load this section";
    return fallback;
  }
}

export async function loadSalesOverviewData(
  companyId: string,
  opts?: { salesUserId?: string }
): Promise<SalesOverviewData> {
  const sectionErrors: SalesOverviewData["sectionErrors"] = {};
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const leadScope = opts?.salesUserId
    ? {
        OR: [
          { assigneeId: opts.salesUserId },
          { assigneeId: null },
        ],
      }
    : {};
  const leadWhere = { companyId, ...leadScope };

  type LeadGroup = { status: LeadStatus; _count: { _all: number } };
  type ActivityRow = LeadActivity & {
    lead: { id: string; firstName: string; lastName: string };
    user: { name: string };
  };
  type ActionLeadRow = Lead & { assignee: { name: string } | null };
  type ClientLeadRow = Lead & {
    assignee: { name: string } | null;
    proposals: Proposal[];
  };

  let leadGroups: LeadGroup[] = [];
  let wonValueAgg: {
    _avg: { estimatedValue: number | null };
    _sum: { estimatedValue: number | null };
    _count: { _all: number };
  } = {
    _avg: { estimatedValue: null },
    _sum: { estimatedValue: null },
    _count: { _all: 0 },
  };
  let activeProposalCount = 0;
  let recentActivities: ActivityRow[] = [];
  let openFollowUps: ActivityRow[] = [];
  let actionLeadsRaw: ActionLeadRow[] = [];
  let recentLead: ClientLeadRow | null = null;
  let assignees: Array<{ id: string; name: string }> = [];
  let openLeads: Array<{ id: string; name: string }> = [];

  try {
    const [groups, wonAgg, proposalCount] = await Promise.all([
      prisma.lead.groupBy({
        by: ["status"],
        where: leadWhere,
        _count: { _all: true },
      }),
      prisma.lead.aggregate({
        where: { ...leadWhere, status: LeadStatus.WON },
        _avg: { estimatedValue: true },
        _sum: { estimatedValue: true },
        _count: { _all: true },
      }),
      prisma.proposal.count({
        where: {
          companyId,
          status: { in: ACTIVE_PROPOSAL_STATUSES },
          ...(opts?.salesUserId
            ? {
                lead: {
                  OR: [
                    { assigneeId: opts.salesUserId },
                    { assigneeId: null },
                  ],
                },
              }
            : {}),
        },
      }),
    ]);
    leadGroups = groups.map((g) => ({
      status: g.status,
      _count: { _all: g._count._all },
    }));
    wonValueAgg = wonAgg;
    activeProposalCount = proposalCount;
  } catch (err) {
    console.error("[sales-overview] kpis", err);
    sectionErrors.kpis =
      err instanceof Error ? err.message : "Failed to load this section";
  }

  try {
    recentActivities = await prisma.leadActivity.findMany({
      where: { lead: leadWhere },
      orderBy: [{ activityDate: "desc" }, { createdAt: "desc" }],
      take: 12,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { name: true } },
      },
    });
  } catch (err) {
    console.error("[sales-overview] activities", err);
    sectionErrors.activities =
      err instanceof Error ? err.message : "Failed to load this section";
  }

  try {
    openFollowUps = await prisma.leadActivity.findMany({
      where: {
        lead: leadWhere,
        dueAt: { not: null },
        completedAt: null,
      },
      orderBy: { dueAt: "asc" },
      take: 40,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        user: { select: { name: true } },
      },
    });
  } catch (err) {
    console.error("[sales-overview] todos", err);
    sectionErrors.todos =
      err instanceof Error ? err.message : "Failed to load this section";
  }

  try {
    actionLeadsRaw = await prisma.lead.findMany({
      where: {
        AND: [
          leadWhere,
          { status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
          {
            OR: [
              { flaggedForFollowUp: true },
              { followUpAt: { lte: endOfWeek } },
              { status: LeadStatus.PROPOSAL },
              { status: LeadStatus.NEGOTIATION },
              { nextAction: { not: null } },
            ],
          },
        ],
      },
      include: { assignee: { select: { name: true } } },
      orderBy: [{ followUpAt: "asc" }, { updatedAt: "desc" }],
      take: 6,
    });
  } catch (err) {
    console.error("[sales-overview] actionLeads", err);
    sectionErrors.actionLeads =
      err instanceof Error ? err.message : "Failed to load this section";
  }

  try {
    recentLead = await prisma.lead.findFirst({
      where: {
        AND: [leadWhere, { status: { notIn: [LeadStatus.LOST] } }],
      },
      include: {
        assignee: { select: { name: true } },
        proposals: {
          orderBy: { updatedAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ followUpAt: "asc" }, { updatedAt: "desc" }],
    });
  } catch (err) {
    console.error("[sales-overview] client", err);
    sectionErrors.client =
      err instanceof Error ? err.message : "Failed to load this section";
  }

  try {
    const memberships = await prisma.membership.findMany({
      where: {
        companyId,
        isActive: true,
        role: { in: ["SALES_MANAGER", "OWNER"] },
      },
      include: { user: { select: { id: true, name: true } } },
    });
    assignees = memberships.map((m) => ({ id: m.user.id, name: m.user.name }));

    const leads = await prisma.lead.findMany({
      where: {
        AND: [
          leadWhere,
          { status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
        ],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    openLeads = leads.map((l) => ({
      id: l.id,
      name: fullName(l.firstName, l.lastName),
    }));
  } catch (err) {
    console.error("[sales-overview] todos", err);
    sectionErrors.todos =
      err instanceof Error ? err.message : "Failed to load this section";
  }

  const countByStatus = new Map(
    leadGroups.map((g) => [g.status, g._count._all] as const)
  );
  const totalLeads = leadGroups.reduce((sum, g) => sum + g._count._all, 0);
  const closedDeals = countByStatus.get(LeadStatus.WON) ?? 0;
  const conversionRate =
    totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 100) : null;
  const avgDeal = wonValueAgg._avg.estimatedValue;
  const revenue = wonValueAgg._sum.estimatedValue;

  const kpis: SalesKpi[] = [
    {
      id: "total-leads",
      label: "Total Leads",
      value: String(totalLeads),
      growth: null,
      accent: "blue",
      icon: "home",
    },
    {
      id: "active-proposals",
      label: "Active Proposals",
      value: String(activeProposalCount),
      growth: null,
      accent: "purple",
      icon: "file",
    },
    {
      id: "conversion-rate",
      label: "Conversion Rate",
      value: conversionRate == null ? "—" : `${conversionRate}%`,
      growth: null,
      accent: "green",
      icon: "rocket",
    },
    {
      id: "avg-deal",
      label: "Average Deal Size",
      value: compactCurrency(avgDeal),
      growth: null,
      accent: "amber",
      icon: "bag",
    },
    {
      id: "closed-deals",
      label: "Closed Deals",
      value: String(closedDeals),
      growth: null,
      accent: "slate",
      icon: "check",
    },
    {
      id: "revenue",
      label: "Revenue",
      value: compactCurrency(revenue),
      growth: null,
      accent: "rose",
      icon: "chart",
    },
  ];

  const activities: SalesActivityItem[] = recentActivities.map((a) => {
    const leadName = fullName(a.lead.firstName, a.lead.lastName);
    return {
      id: a.id,
      title: activityTitle(a, leadName),
      description: a.content,
      relativeTime: formatRelativeTime(a.activityDate ?? a.createdAt),
      type: a.type,
      href: `/sales/leads/${a.lead.id}`,
    };
  });

  const todos: TodoItem[] = openFollowUps.map((a) => ({
    id: a.id,
    title: a.title?.trim() || fullName(a.lead.firstName, a.lead.lastName),
    description: a.content,
    dueDate: a.dueAt,
    priority: a.priority ?? Priority.MEDIUM,
    projectName: fullName(a.lead.firstName, a.lead.lastName),
    assigneeName: a.user.name,
    href: `/sales/leads/${a.lead.id}`,
  }));

  const calendarEvents: CalendarEvent[] = [
    ...openFollowUps
      .filter((a) => a.dueAt)
      .map((a) => ({
        id: `followup-${a.id}`,
        date: (a.dueAt as Date).toISOString(),
        title: a.title?.trim() || fullName(a.lead.firstName, a.lead.lastName),
        type: "task" as const,
        meta: a.type,
      })),
    ...actionLeadsRaw
      .filter((l) => l.followUpAt)
      .map((l) => ({
        id: `lead-followup-${l.id}`,
        date: (l.followUpAt as Date).toISOString(),
        title: fullName(l.firstName, l.lastName),
        type: "schedule" as const,
        meta: l.nextAction || "Follow-up",
      })),
  ];

  const pipeline: PipelineStage[] = PIPELINE_STAGES.map((stage) => {
    const count = stage.statuses.reduce(
      (sum, status) => sum + (countByStatus.get(status) ?? 0),
      0
    );
    const stageParam = stage.statuses[0];
    return {
      ...stage,
      count,
      href: `/sales/leads?stage=${stageParam}`,
    };
  });

  const actionLeads: ActionLead[] = actionLeadsRaw.map((lead) => ({
    id: lead.id,
    name: fullName(lead.firstName, lead.lastName),
    email: lead.email,
    phone: lead.phone,
    estimatedValue: lead.estimatedValue,
    source: lead.source,
    assigneeName: lead.assignee?.name ?? null,
    nextAction:
      lead.nextAction ||
      (lead.followUpAt && lead.followUpAt < startOfToday
        ? "Follow-up overdue"
        : lead.followUpAt && lead.followUpAt < endOfWeek
          ? "Follow-up due"
          : lead.status === LeadStatus.PROPOSAL
            ? "Proposal awaiting response"
            : null),
    lastContactAt: lead.lastContactAt,
    status: lead.status,
    statusLabel: lead.status.replace(/_/g, " "),
    href: `/sales/leads/${lead.id}`,
  }));

  const clientItems: ClientInfoItem[] = recentLead
    ? [
        {
          id: "client-name",
          label: "Client Name",
          value: fullName(recentLead.firstName, recentLead.lastName),
          href: `/sales/leads/${recentLead.id}`,
        },
        {
          id: "status",
          label: "Pipeline Status",
          value: recentLead.status.replace(/_/g, " "),
          href: `/sales/leads/${recentLead.id}`,
        },
        {
          id: "value",
          label: "Est. Value",
          value: formatCurrency(recentLead.estimatedValue),
          href: `/sales/leads/${recentLead.id}`,
        },
        {
          id: "source",
          label: "Source",
          value: recentLead.source || "—",
          href: `/sales/leads/${recentLead.id}`,
        },
        {
          id: "assignee",
          label: "Assigned To",
          value: recentLead.assignee?.name || "Unassigned",
          href: `/sales/leads/${recentLead.id}`,
        },
        {
          id: "proposal",
          label: "Latest Proposal",
          value: recentLead.proposals[0]
            ? `${recentLead.proposals[0].title} (${recentLead.proposals[0].status})`
            : "None",
          href: recentLead.proposals[0]
            ? `/sales/proposals`
            : `/sales/leads/${recentLead.id}`,
        },
      ]
    : [];

  const insights = await safeSection("insights", sectionErrors, [] as InsightCard[], async () => {
    const cards: InsightCard[] = [];
    const staleCutoff = new Date(now);
    staleCutoff.setDate(staleCutoff.getDate() - 14);

    const [overdueFollowUps, waitingProposals, staleLeads, upcomingVisits] =
      await Promise.all([
        prisma.lead.count({
          where: {
            AND: [
              leadWhere,
              { status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
              { followUpAt: { lt: startOfToday } },
            ],
          },
        }),
        prisma.proposal.count({
          where: {
            companyId,
            status: ProposalStatus.SENT,
            ...(opts?.salesUserId
              ? {
                  lead: {
                    OR: [
                      { assigneeId: opts.salesUserId },
                      { assigneeId: null },
                    ],
                  },
                }
              : {}),
          },
        }),
        prisma.lead.count({
          where: {
            AND: [
              leadWhere,
              { status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
              { updatedAt: { lt: staleCutoff } },
            ],
          },
        }),
        prisma.leadActivity.count({
          where: {
            lead: leadWhere,
            type: { in: ["SITE_VISIT", "MEETING"] },
            dueAt: { gte: startOfToday, lt: endOfWeek },
            completedAt: null,
          },
        }),
      ]);

    if (overdueFollowUps > 0) {
      cards.push({
        id: "overdue-followups",
        category: "Follow-ups",
        severity: "HIGH",
        message: `${overdueFollowUps} lead${overdueFollowUps === 1 ? "" : "s"} ${overdueFollowUps === 1 ? "has" : "have"} an overdue follow-up.`,
        href: "/sales/leads?filter=overdue",
        actionLabel: "View Details",
      });
    }
    if (waitingProposals > 0) {
      cards.push({
        id: "waiting-proposals",
        category: "Proposals",
        severity: "MEDIUM",
        message: `${waitingProposals} proposal${waitingProposals === 1 ? "" : "s"} awaiting client response.`,
        href: "/sales/proposals",
        actionLabel: "Process",
      });
    }
    if (staleLeads > 0) {
      cards.push({
        id: "stale-leads",
        category: "Activity",
        severity: "NEW",
        message: `${staleLeads} open lead${staleLeads === 1 ? "" : "s"} with no updates in 14+ days.`,
        href: "/sales/leads?filter=stale",
        actionLabel: "Review",
      });
    }
    if (upcomingVisits > 0 && cards.length < 3) {
      cards.push({
        id: "upcoming-visits",
        category: "Schedule",
        severity: "MEDIUM",
        message: `${upcomingVisits} site visit${upcomingVisits === 1 ? "" : "s"} / meeting${upcomingVisits === 1 ? "" : "s"} scheduled this week.`,
        href: "/sales/activities",
        actionLabel: "View Details",
      });
    }

    return cards.slice(0, 3);
  });

  return {
    kpis,
    activities,
    todos,
    calendarEvents,
    pipeline,
    actionLeads,
    clientItems,
    insights,
    assignees,
    leadsForForm: openLeads,
    sectionErrors,
  };
}
