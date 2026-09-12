import Link from "next/link";
import { Role, ScheduleStatus } from "@prisma/client";
import { createScheduleItemAction } from "@/lib/actions";
import { PageHeader, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField, Input, Select } from "@/components/ui/form";
import { ActionForm } from "@/components/ui/action-form";
import { SubmitButton } from "@/components/ui/submit-button";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import {
  MilestoneStatusList,
  ScheduleItemStatusList,
} from "@/components/schedule/milestone-status-list";
import {
  mapScheduleStatus,
  type GanttTask,
} from "@/lib/schedule/gantt-status";
import { isPastDue } from "@/lib/schedule/display-status";
import { ClientInfoStrip } from "@/components/dashboard/client-info-strip";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import {
  buildProjectInsights,
  depositOpenStatuses,
} from "@/lib/insights";
import { computeProjectProgress } from "@/lib/dashboard/progress";
import { requireRole, getAccessibleProjectIds } from "@/lib/session";
import { getSelectedProjectId } from "@/lib/pm/project-context";
import { prisma } from "@/lib/db";
import { PmProjectPicker } from "@/components/pm/project-picker";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMSchedulePage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
  ]);
  const { projectId: paramProjectId } = await searchParams;
  const projectIds = await getAccessibleProjectIds(session);
  const filterProjectId = await getSelectedProjectId(session, paramProjectId);
  const filteredIds =
    filterProjectId && projectIds.includes(filterProjectId)
      ? [filterProjectId]
      : projectIds;

  const scheduleCap = filterProjectId ? 500 : 200;
  const [
    scheduleItems,
    milestones,
    projects,
    projectMeta,
    depositSum,
    delayedStored,
    pendingDocs,
  ] = await Promise.all([
    prisma.scheduleItem.findMany({
      where: { projectId: { in: filteredIds } },
      select: {
        id: true,
        title: true,
        startDate: true,
        endDate: true,
        status: true,
        projectId: true,
        assigneeName: true,
        trade: true,
        dependsOnId: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { startDate: "asc" },
      take: scheduleCap,
    }),
    prisma.milestone.findMany({
      where: { projectId: { in: filteredIds } },
      select: {
        id: true,
        title: true,
        dueDate: true,
        status: true,
        sortOrder: true,
        projectId: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { sortOrder: "asc" },
      take: filterProjectId ? 200 : 100,
    }),
    prisma.project.findMany({
      where: { id: { in: projectIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { id: { in: filteredIds } },
      select: {
        id: true,
        name: true,
        status: true,
        progressPercent: true,
        lotInfo: true,
        municipalAddress: true,
        buyer: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        deposits: {
          take: 6,
          orderBy: { dueDate: "asc" },
          select: {
            id: true,
            amount: true,
            status: true,
            dueDate: true,
            label: true,
          },
        },
        milestones: { select: { status: true } },
        scheduleItems: { select: { status: true } },
        tasks: { select: { status: true } },
      },
    }),
    prisma.deposit.aggregate({
      where: {
        projectId: { in: filteredIds },
        status: { in: depositOpenStatuses() },
      },
      _sum: { amount: true },
    }),
    prisma.scheduleItem.count({
      where: {
        projectId: { in: filteredIds },
        status: ScheduleStatus.DELAYED,
      },
    }),
    prisma.document.count({
      where: { projectId: { in: filteredIds } },
    }),
  ]);

  const overdueByDate = scheduleItems.filter((s) =>
    isPastDue(s.endDate, s.status)
  ).length;
  const delayedCount = Math.max(delayedStored, overdueByDate);

  const avgProgress =
    projectMeta.length > 0
      ? Math.round(
          projectMeta.reduce(
            (s, p) =>
              s +
              computeProjectProgress({
                progressPercent: p.progressPercent,
                status: p.status,
                milestones: p.milestones,
                scheduleItems: p.scheduleItems,
                tasks: p.tasks,
              }),
            0
          ) / projectMeta.length
        )
      : 0;

  const ganttTasks: GanttTask[] = scheduleItems.map((item) => ({
    id: item.id,
    title: item.title,
    startDate: item.startDate,
    endDate: item.endDate,
    status: mapScheduleStatus(item.status, item.endDate),
    assigneeName: item.assigneeName,
    projectName: item.project.name,
    trade: item.trade,
    dependsOnId: item.dependsOnId,
  }));

  const primary = projectMeta[0];
  const clientItems = [
    {
      id: "deposit",
      label: "Sales Deposit",
      value: primary?.deposits[0]
        ? `$${primary.deposits[0].amount.toLocaleString()}`
        : "—",
      href: filterProjectId
        ? `/pm/projects/${filterProjectId}`
        : "/bookkeeper/invoices",
    },
    {
      id: "client",
      label: "Client Name",
      value: primary?.buyer
        ? `${primary.buyer.firstName} ${primary.buyer.lastName}`
        : projectMeta.find((p) => p.buyer)?.buyer
          ? `${projectMeta.find((p) => p.buyer)!.buyer!.firstName} ${projectMeta.find((p) => p.buyer)!.buyer!.lastName}`
          : "—",
      href: filterProjectId ? `/pm/projects/${filterProjectId}` : "/pm/projects",
    },
    {
      id: "procurement",
      label: "Procurement",
      value: scheduleItems.find((s) =>
        (s.trade ?? "").toLowerCase().includes("procure")
      )?.title ?? "Track trades",
      href: "/pm/schedule",
    },
    {
      id: "lot",
      label: "Lot / Address",
      value: primary?.lotInfo ?? primary?.municipalAddress ?? "—",
    },
    {
      id: "pm",
      label: "Project",
      value: primary?.name ?? `${filteredIds.length} projects`,
      href: filterProjectId
        ? `/pm/projects/${filterProjectId}`
        : "/pm/projects",
    },
    {
      id: "progress",
      label: "Progress",
      value: `${avgProgress}%`,
    },
  ];

  const insights = buildProjectInsights({
    delayedScheduleCount: delayedCount,
    expectedDepositAmount: depositSum._sum.amount ?? 0,
    pendingDocCount: Math.min(pendingDocs, 12),
  });

  const manageRoles: Role[] = [
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.OPERATIONS_ADMIN,
  ];
  const canManage = manageRoles.includes(session.membership.role);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Schedule"
        description="Gantt timeline, client info, and schedule insights"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <PmProjectPicker
              compact
              returnTo="/pm/schedule"
              selectedProjectId={filterProjectId}
              projects={projects.map((p) => ({
                id: p.id,
                name: p.name,
                status: "ACTIVE",
              }))}
            />
            {filterProjectId ? (
              <Link href="/pm/schedule">
                <Button variant="outline" size="sm">
                  All projects
                </Button>
              </Link>
            ) : null}
          </div>
        }
      />

      {scheduleItems.length === 0 && milestones.length === 0 ? (
        <EmptyState
          title="No schedule items"
          description="Add schedule items below to populate the Gantt chart."
        />
      ) : (
        <GanttChart
          className="w-full"
          tasks={ganttTasks}
          progressPercent={avgProgress}
          addHref="#add-schedule"
        />
      )}

      <ClientInfoStrip
        items={clientItems}
        viewAllHref={
          filterProjectId
            ? `/pm/projects/${filterProjectId}`
            : "/pm/projects"
        }
      />

      <AiInsightsPanel insights={insights} viewAllHref="/pm" />

      <MilestoneStatusList
        canManage={canManage}
        milestones={milestones.map((m) => ({
          id: m.id,
          title: m.title,
          status: m.status,
          dueDate: m.dueDate,
          projectName: m.project.name,
        }))}
      />

      <ScheduleItemStatusList
        canManage={canManage}
        items={scheduleItems.map((s) => ({
          id: s.id,
          title: s.title,
          status: s.status,
          endDate: s.endDate,
          projectName: s.project.name,
          trade: s.trade,
        }))}
      />

      <Card id="add-schedule">
        <h2 className="text-lg font-semibold text-sb-ink">Add schedule item</h2>
        <ActionForm
          action={createScheduleItemAction}
          successMessage="Schedule item added"
          className="mt-4 grid gap-4 md:grid-cols-2"
        >
          <FormField label="Project">
            <Select
              name="projectId"
              required
              defaultValue={filterProjectId ?? ""}
            >
              <option value="" disabled>
                Select project
              </option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Title">
            <Input name="title" required />
          </FormField>
          <FormField label="Trade">
            <Input name="trade" placeholder="Framing, electrical..." />
          </FormField>
          <FormField label="Assignee name">
            <Input name="assigneeName" />
          </FormField>
          <FormField label="Start date">
            <Input name="startDate" type="date" required />
          </FormField>
          <FormField label="End date">
            <Input name="endDate" type="date" required />
          </FormField>
          <FormField label="Depends on">
            <Select name="dependsOnId" defaultValue="">
              <option value="">None</option>
              {scheduleItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Status">
            <Select name="status" defaultValue={ScheduleStatus.PLANNED}>
              {Object.values(ScheduleStatus).map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Location">
            <Input name="location" placeholder="Optional jobsite / address" />
          </FormField>
          <div className="flex flex-col gap-2 md:col-span-2">
            <label className="flex items-center gap-2 text-[13px] text-sb-ink">
              <input
                type="checkbox"
                name="syncToGoogle"
                value="true"
                className="rounded border-sb-border"
              />
              Sync to Google Calendar (if connected)
            </label>
            <label className="flex items-center gap-2 text-[13px] text-sb-ink">
              <input
                type="checkbox"
                name="createMeet"
                value="true"
                className="rounded border-sb-border"
              />
              Add Google Meet link
            </label>
          </div>
          <div className="md:col-span-2">
            <SubmitButton pendingLabel="Adding…">Add to schedule</SubmitButton>
          </div>
        </ActionForm>
      </Card>
    </div>
  );
}
