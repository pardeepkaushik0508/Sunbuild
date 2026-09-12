import Link from "next/link";
import { Role } from "@prisma/client";
import { MetricCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecentJobsCard } from "@/components/dashboard/recent-jobs-widget";
import { TodoWidget } from "@/components/dashboard/todo-widget";
import { CalendarWidget } from "@/components/dashboard/calendar-widget";
import { AiInsightsPanel } from "@/components/dashboard/ai-insights";
import { GanttChartLazy as GanttChart } from "@/components/schedule/gantt-chart-lazy";
import { ClientInfoStrip } from "@/components/dashboard/client-info-strip";
import { PmProjectPicker } from "@/components/pm/project-picker";
import { requireRole } from "@/lib/session";
import { loadPmOverviewData } from "@/lib/pm/load-pm-overview";
import { Card } from "@/components/ui/card";

type PageProps = {
  searchParams: Promise<{ projectId?: string }>;
};

export default async function PMDashboardPage({ searchParams }: PageProps) {
  const session = await requireRole([
    Role.PROJECT_MANAGER,
    Role.OWNER,
    Role.CEO,
    Role.OPERATIONS_ADMIN,
  ]);
  const { projectId } = await searchParams;
  const data = await loadPmOverviewData(session, projectId);

  const moduleLinks = [
    { href: "/pm/tasks", label: "To-Dos" },
    { href: "/pm/schedule", label: "Schedule" },
    { href: "/pm/daily-logs", label: "Daily Logs" },
    { href: "/pm/rfis", label: "RFIs" },
    { href: "/pm/change-orders", label: "Change Orders" },
    { href: "/pm/selections", label: "Selections" },
  ];

  return (
    <div className="w-full space-y-5 pb-8">
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-sb-muted">
            Project Manager Overview
          </p>
          <h1 className="mt-1 truncate text-xl font-bold text-sb-ink">
            {data.selectedProject?.name ?? "Select a project"}
          </h1>
          <p className="text-sm text-sb-muted">
            {data.selectedProject
              ? `${data.activeProjectCount} active jobs · context applied across PM modules`
              : "Choose a project to focus tasks, schedule, RFIs, and selections"}
          </p>
        </div>
        <div className="w-full sm:max-w-sm">
          <PmProjectPicker
            compact
            selectedProjectId={data.selectedId}
            returnTo="/pm"
            projects={data.projects.map((p) => ({
              id: p.id,
              name: p.name,
              municipalAddress: p.municipalAddress,
              status: p.status,
              buyerName: p.buyerName,
            }))}
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {data.stats.map((s) => (
          <MetricCard
            key={s.id}
            label={s.label}
            value={s.value}
            accent={s.accent}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {moduleLinks.map((m) => (
          <Link
            key={m.href}
            href={
              data.selectedId
                ? `${m.href}?projectId=${data.selectedId}`
                : m.href
            }
          >
            <Button variant="outline" size="sm">
              {m.label}
            </Button>
          </Link>
        ))}
        <Link href="/pm/projects">
          <Button size="sm">Project Selection</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentJobsCard
          jobs={data.projects.map((p) => ({
            id: p.id,
            name: p.name,
            progressPercent: p.progressPercent,
            href: `/pm/projects/${p.id}`,
          }))}
          selectedProjectId={data.selectedId}
          selectHrefBase="/pm"
          viewAllHref="/pm/projects"
        />
        <TodoWidget
          items={data.todos}
          viewAllHref={
            data.selectedId
              ? `/pm/tasks?projectId=${data.selectedId}`
              : "/pm/tasks"
          }
          projects={data.projectsForTaskForm}
          assignees={data.assigneesForTaskForm}
          defaultProjectId={data.selectedId}
          enableCreate
        />
        <div className="lg:col-span-2 xl:col-span-1">
          <CalendarWidget
            events={data.calendarEvents}
            subtitle="Project schedule overview"
            googleConnected={data.googleCalendarConnected}
            googleReconnectRequired={data.googleReconnectRequired}
            connectReturnPath="/pm"
          />
        </div>
      </div>

      <GanttChart
        className="w-full"
        tasks={data.ganttTasks.map((t) => ({
          ...t,
          href: data.selectedId
            ? `/pm/schedule?projectId=${data.selectedId}`
            : "/pm/schedule",
        }))}
        progressPercent={data.progressPercent}
        addHref={
          data.selectedId
            ? `/pm/schedule?projectId=${data.selectedId}`
            : "/pm/schedule"
        }
        projectLabel={data.selectedProject?.name}
      />

      <ClientInfoStrip
        items={data.clientItems}
        viewAllHref={
          data.selectedId
            ? `/pm/projects/${data.selectedId}`
            : "/pm/projects"
        }
        emptyMessage="Select a project to view client information."
      />

      <AiInsightsPanel
        insights={data.insights}
        viewAllHref={
          data.selectedId ? `/pm/tasks?projectId=${data.selectedId}` : "/pm/tasks"
        }
      />
    </div>
  );
}
